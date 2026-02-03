import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIZE_URL = "https://ldpkatiahdlzbpuvuscd.supabase.co/functions/v1/categorize-transaction";

// Transaction management functions
async function addTransaction(supabase: any, userId: string, data: any): Promise<{ success: boolean; message: string; transaction?: any }> {
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      description: data.description,
      amount: data.amount,
      category: data.category || "other",
      payment_method: data.payment_method || "pix",
      status: data.status || "paid",
      is_recurring: data.is_recurring || false,
      transaction_date: data.transaction_date || new Date().toISOString().split("T")[0],
      notes: data.notes,
      member_id: data.member_id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: `Erro ao adicionar: ${error.message}` };
  }
  return { success: true, message: "Transação adicionada com sucesso!", transaction: tx };
}

async function updateTransaction(supabase: any, id: string, data: any): Promise<{ success: boolean; message: string }> {
  const updates: any = {};
  if (data.description) updates.description = data.description;
  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.category) updates.category = data.category;
  if (data.payment_method) updates.payment_method = data.payment_method;
  if (data.status) updates.status = data.status;
  if (data.is_recurring !== undefined) updates.is_recurring = data.is_recurring;
  if (data.transaction_date) updates.transaction_date = data.transaction_date;
  if (data.notes !== undefined) updates.notes = data.notes;

  const { error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id);

  if (error) {
    return { success: false, message: `Erro ao atualizar: ${error.message}` };
  }
  return { success: true, message: "Transação atualizada com sucesso!" };
}

async function deleteTransaction(supabase: any, id: string): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, message: `Erro ao excluir: ${error.message}` };
  }
  return { success: true, message: "Transação excluída com sucesso!" };
}

async function searchTransactions(supabase: any, query: string): Promise<any[]> {
  const { data } = await supabase
    .from("transactions")
    .select("id, description, amount, category, transaction_date")
    .ilike("description", `%${query}%`)
    .order("transaction_date", { ascending: false })
    .limit(10);
  
  return data || [];
}

async function recategorizeTransactions(supabase: any, userId: string, apiKey: string): Promise<{ updated: number; total: number }> {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, category");

  if (error || !transactions || transactions.length === 0) {
    return { updated: 0, total: 0 };
  }

  const response = await fetch(CATEGORIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      categorizeAll: true,
      descriptions: transactions.map((t: any) => ({ id: t.id, description: t.description })),
    }),
  });

  if (!response.ok) {
    return { updated: 0, total: transactions.length };
  }

  const data = await response.json();
  const categories: { id: string; category: string }[] = data.categories || [];

  let updated = 0;
  for (const cat of categories) {
    const original = transactions.find((t: any) => t.id === cat.id);
    if (cat.category && original && cat.category !== original.category) {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({ category: cat.category })
        .eq("id", cat.id);

      if (!updateError) {
        updated++;
      }
    }
  }

  return { updated, total: transactions.length };
}

// Parse AI response for function calls
function parseAIFunctionCall(content: string): { action: string; params: any } | null {
  const functionPatterns = [
    { regex: /\[ADICIONAR:\s*(.+?)\]/i, action: "add" },
    { regex: /\[EDITAR:\s*(.+?)\]/i, action: "update" },
    { regex: /\[EXCLUIR:\s*(.+?)\]/i, action: "delete" },
    { regex: /\[BUSCAR:\s*(.+?)\]/i, action: "search" },
  ];

  for (const pattern of functionPatterns) {
    const match = content.match(pattern.regex);
    if (match) {
      try {
        const params = JSON.parse(match[1]);
        return { action: pattern.action, params };
      } catch {
        return { action: pattern.action, params: match[1] };
      }
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";

    // Check for categorization request
    const wantsCategorization = lastMessage.includes("categorizar") || 
                                lastMessage.includes("categorize") ||
                                lastMessage.includes("organizar categoria") ||
                                lastMessage.includes("classificar");

    let categorizationResult: { updated: number; total: number } | null = null;
    if (wantsCategorization) {
      categorizationResult = await recategorizeTransactions(supabase, user.id, LOVABLE_API_KEY);
    }

    // Fetch transaction data
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];
    
    const { data: currentMonthTxs } = await supabase
      .from("transactions")
      .select("*")
      .gte("transaction_date", startOfMonth)
      .lte("transaction_date", endOfMonth)
      .order("transaction_date", { ascending: false });

    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split("T")[0];
    const endOfLastMonth = new Date(currentYear, currentMonth, 0).toISOString().split("T")[0];
    
    const { data: lastMonthTxs } = await supabase
      .from("transactions")
      .select("*")
      .gte("transaction_date", startOfLastMonth)
      .lte("transaction_date", endOfLastMonth);

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    const transactions = currentMonthTxs || [];
    const lastMonthTransactions = lastMonthTxs || [];
    
    const totalExpenses = transactions
      .filter((t: any) => t.amount < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
    
    const totalIncome = transactions
      .filter((t: any) => t.amount > 0)
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const lastMonthExpenses = lastMonthTransactions
      .filter((t: any) => t.amount < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

    const byCategory: Record<string, number> = {};
    transactions
      .filter((t: any) => t.amount < 0)
      .forEach((t: any) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(t.amount);
      });

    const lastMonthByCategory: Record<string, number> = {};
    lastMonthTransactions
      .filter((t: any) => t.amount < 0)
      .forEach((t: any) => {
        lastMonthByCategory[t.category] = (lastMonthByCategory[t.category] || 0) + Math.abs(t.amount);
      });

    const recurringExpenses = transactions.filter((t: any) => t.is_recurring);

    const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const currentMonthName = monthNames[currentMonth];
    const lastMonthName = monthNames[currentMonth === 0 ? 11 : currentMonth - 1];

    const categoryLabels: Record<string, string> = {
      food: "Alimentação",
      transport: "Transporte",
      entertainment: "Lazer",
      health: "Saúde",
      education: "Educação",
      shopping: "Compras",
      bills: "Contas Fixas",
      other: "Outros"
    };

    const categoryBreakdown = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `- ${categoryLabels[cat] || cat}: R$ ${amount.toFixed(2)}`)
      .join("\n");

    const recentTransactions = transactions.slice(0, 15)
      .map((t: any) => `- ID: ${t.id.slice(0, 8)} | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${categoryLabels[t.category] || t.category}) - ${t.transaction_date}`)
      .join("\n");

    const categorizationInfo = categorizationResult 
      ? `\n\nAÇÃO EXECUTADA - CATEGORIZAÇÃO AUTOMÁTICA:
- Total de transações analisadas: ${categorizationResult.total}
- Transações recategorizadas: ${categorizationResult.updated}
- ${categorizationResult.updated > 0 ? "As categorias foram atualizadas com sucesso!" : "Todas as transações já estavam bem categorizadas."}`
      : "";

    const systemPrompt = `Você é o Odin, um assistente financeiro pessoal inteligente do CasaCampos. Você ajuda famílias brasileiras a gerenciar suas finanças domésticas.

INFORMAÇÕES DO USUÁRIO:
- Nome: ${profile?.display_name || "Usuário"}

DADOS FINANCEIROS DE ${currentMonthName.toUpperCase()} (COMPARTILHADOS PELA FAMÍLIA):
- Total de gastos: R$ ${totalExpenses.toFixed(2)}
- Total de receitas: R$ ${totalIncome.toFixed(2)}
- Saldo: R$ ${(totalIncome - totalExpenses).toFixed(2)}
- Número de transações: ${transactions.length}

COMPARAÇÃO COM ${lastMonthName.toUpperCase()}:
- Gastos do mês passado: R$ ${lastMonthExpenses.toFixed(2)}
- Variação: ${lastMonthExpenses > 0 ? ((totalExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1) : 0}%

GASTOS POR CATEGORIA:
${categoryBreakdown || "Nenhum gasto registrado ainda"}

TRANSAÇÕES RECENTES (com IDs para referência):
${recentTransactions || "Nenhuma transação registrada"}

DESPESAS RECORRENTES:
${recurringExpenses.length > 0 ? recurringExpenses.map((t: any) => `- ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)}`).join("\n") : "Nenhuma despesa recorrente"}
${categorizationInfo}

SUAS CAPACIDADES DE GERENCIAMENTO:
Você pode executar ações diretamente nos lançamentos. Para isso, use os seguintes comandos em sua resposta:

1. ADICIONAR LANÇAMENTO:
   [ADICIONAR: {"description": "Nome", "amount": -100, "category": "food", "payment_method": "pix", "status": "paid"}]
   
2. EDITAR LANÇAMENTO (use o ID das transações listadas):
   [EDITAR: {"id": "abc12345", "description": "Novo nome", "amount": -150}]
   
3. EXCLUIR LANÇAMENTO:
   [EXCLUIR: {"id": "abc12345"}]

Categorias válidas: food, transport, entertainment, health, education, shopping, bills, other
Formas de pagamento: pix, boleto, card, cash
Status: paid, pending

INSTRUÇÕES:
1. Seja amigável, use emojis ocasionalmente
2. Baseie suas respostas nos dados reais da família
3. Quando o usuário pedir para adicionar, editar ou excluir lançamentos, USE OS COMANDOS ACIMA
4. Sempre confirme a ação executada ao usuário
5. Use formatação markdown para destacar valores
6. Sempre responda em português brasileiro
7. Se o usuário disser "apaga", "exclui", "remove" + descrição, encontre o ID correspondente e execute
8. Valores de gastos devem ser NEGATIVOS (ex: -100 para um gasto de R$100)`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Por favor, aguarde um momento." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao conectar com a IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process streaming response and execute any function calls
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(value);
            
            // Accumulate content for function parsing
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const json = JSON.parse(line.slice(6));
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) fullContent += content;
                } catch { /* ignore parse errors */ }
              }
            }
          }

          // After streaming completes, check for function calls
          const functionCall = parseAIFunctionCall(fullContent);
          if (functionCall) {
            let result: { success: boolean; message: string };
            
            switch (functionCall.action) {
              case "add":
                result = await addTransaction(supabase, user.id, functionCall.params);
                break;
              case "update":
                result = await updateTransaction(supabase, functionCall.params.id, functionCall.params);
                break;
              case "delete":
                result = await deleteTransaction(supabase, functionCall.params.id);
                break;
              default:
                result = { success: false, message: "Ação não reconhecida" };
            }

            // Send action result as final message
            const actionResult = `\n\ndata: ${JSON.stringify({
              choices: [{
                delta: { content: `\n\n✅ ${result.message}` }
              }]
            })}\n\n`;
            controller.enqueue(encoder.encode(actionResult));
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("clara-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
