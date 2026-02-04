import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Category labels for display
const categoryLabels: Record<string, string> = {
  food: "Alimentação",
  transport: "Transporte",
  entertainment: "Lazer",
  health: "Saúde",
  education: "Educação",
  shopping: "Compras",
  bills: "Contas Fixas",
  other: "Outros",
};

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Transaction management functions - now family-scoped
async function addTransaction(supabase: any, userId: string, householdId: string, data: any): Promise<{ success: boolean; message: string; transaction?: any }> {
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      household_id: householdId,
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

async function updateTransaction(supabase: any, householdId: string, id: string, data: any): Promise<{ success: boolean; message: string }> {
  // Validate UUID
  if (!UUID_REGEX.test(id)) {
    return { success: false, message: `ID inválido: "${id}" não é um UUID válido.` };
  }

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
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) {
    return { success: false, message: `Erro ao atualizar: ${error.message}` };
  }
  return { success: true, message: "Transação atualizada com sucesso!" };
}

// Preview deletion - returns summary without deleting
async function previewDeletion(supabase: any, householdId: string, filters: any): Promise<{
  success: boolean;
  count: number;
  transactionIds: string[];
  sumAmount: number;
  rangeLabel: string;
  topCategories: { name: string; count: number }[];
  message: string;
}> {
  let query = supabase
    .from("transactions")
    .select("id, amount, category, transaction_date")
    .eq("household_id", householdId);

  let rangeLabel = "";
  const now = new Date();

  // Apply filters
  if (filters.month !== undefined && filters.year !== undefined) {
    const start = new Date(filters.year, filters.month, 1).toISOString().split("T")[0];
    const end = new Date(filters.year, filters.month + 1, 0).toISOString().split("T")[0];
    query = query.gte("transaction_date", start).lte("transaction_date", end);
    rangeLabel = `${monthNames[filters.month]}/${filters.year}`;
  } else if (filters.startDate && filters.endDate) {
    query = query.gte("transaction_date", filters.startDate).lte("transaction_date", filters.endDate);
    rangeLabel = `${filters.startDate} a ${filters.endDate}`;
  } else {
    // Default: current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    query = query.gte("transaction_date", start).lte("transaction_date", end);
    rangeLabel = `${monthNames[now.getMonth()]}/${now.getFullYear()}`;
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
    rangeLabel += ` (${categoryLabels[filters.category] || filters.category})`;
  }

  const { data: transactions, error } = await query;

  if (error) {
    return {
      success: false,
      count: 0,
      transactionIds: [],
      sumAmount: 0,
      rangeLabel: "",
      topCategories: [],
      message: `Erro ao buscar: ${error.message}`,
    };
  }

  const txList = transactions || [];
  const transactionIds = txList.map((t: any) => t.id); // Full UUIDs
  const sumAmount = txList.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

  const categoryCount: Record<string, number> = {};
  txList.forEach((t: any) => {
    const cat = categoryLabels[t.category] || t.category;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    success: true,
    count: txList.length,
    transactionIds,
    sumAmount,
    rangeLabel,
    topCategories,
    message: txList.length > 0
      ? `Encontrados ${txList.length} lançamentos para exclusão (${rangeLabel}).`
      : `Nenhum lançamento encontrado para os filtros especificados.`,
  };
}

// Validate user is a member of the household
async function validateHouseholdMembership(supabase: any, userId: string, householdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .single();

  if (error || !data) {
    console.log(`User ${userId} is not a member of household ${householdId}`);
    return false;
  }
  return true;
}

// Get household name for context
async function getHouseholdName(supabase: any, householdId: string): Promise<string> {
  const { data } = await supabase
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();
  return data?.name || "Família";
}

// Define AI tools for function calling
const aiTools = [
  {
    type: "function",
    function: {
      name: "add_transaction",
      description: "Adicionar um novo lançamento financeiro. Use para gastos (amount negativo) ou receitas (amount positivo).",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Descrição do lançamento" },
          amount: { type: "number", description: "Valor em reais. NEGATIVO para gastos, POSITIVO para receitas" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"], description: "Categoria do lançamento" },
          payment_method: { type: "string", enum: ["pix", "boleto", "card", "cash"], description: "Forma de pagamento" },
          status: { type: "string", enum: ["paid", "pending"], description: "Status do pagamento" },
          transaction_date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          notes: { type: "string", description: "Observações adicionais" },
        },
        required: ["description", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_transaction",
      description: "Atualizar um lançamento existente usando o ID completo (UUID).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "ID completo (UUID) do lançamento a atualizar" },
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
          payment_method: { type: "string", enum: ["pix", "boleto", "card", "cash"] },
          status: { type: "string", enum: ["paid", "pending"] },
          transaction_date: { type: "string" },
          notes: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_deletion_preview",
      description: "SEMPRE use esta função antes de qualquer exclusão. Retorna preview do que será excluído para confirmação do usuário. NUNCA execute exclusão diretamente.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "integer", description: "Mês (0-11). 0=Janeiro, 11=Dezembro" },
          year: { type: "integer", description: "Ano (ex: 2026)" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"], description: "Filtrar por categoria" },
          startDate: { type: "string", description: "Data inicial YYYY-MM-DD" },
          endDate: { type: "string", description: "Data final YYYY-MM-DD" },
        },
        required: [],
      },
    },
  },
];

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

    const { messages, householdId } = await req.json();

    // CRITICAL: Validate householdId is provided and is valid UUID
    if (!householdId) {
      return new Response(JSON.stringify({ error: "householdId é obrigatório. Selecione uma família." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!UUID_REGEX.test(householdId)) {
      return new Response(JSON.stringify({ error: "householdId inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRITICAL: Validate user is a member of this household
    const isMember = await validateHouseholdMembership(supabase, user.id, householdId);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Você não tem permissão para acessar esta família." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get household name for personalized responses
    const householdName = await getHouseholdName(supabase, householdId);

    // Fetch transaction data - FILTERED BY HOUSEHOLD
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];
    
    const { data: currentMonthTxs } = await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .gte("transaction_date", startOfMonth)
      .lte("transaction_date", endOfMonth)
      .order("transaction_date", { ascending: false });

    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split("T")[0];
    const endOfLastMonth = new Date(currentYear, currentMonth, 0).toISOString().split("T")[0];
    
    const { data: lastMonthTxs } = await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .gte("transaction_date", startOfLastMonth)
      .lte("transaction_date", endOfLastMonth);

    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name, balance, type")
      .eq("household_id", householdId)
      .eq("is_active", true);

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name, icon, color")
      .or(`household_id.eq.${householdId},is_system.eq.true`);

    const { data: familyMembers } = await supabase
      .from("family_members")
      .select("id, name, role")
      .eq("household_id", householdId);

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

    const recurringExpenses = transactions.filter((t: any) => t.is_recurring);
    const totalBalance = (accounts || []).reduce((sum: number, acc: any) => sum + acc.balance, 0);

    const currentMonthName = monthNames[currentMonth];
    const lastMonthName = monthNames[currentMonth === 0 ? 11 : currentMonth - 1];

    const categoryBreakdown = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `- ${categoryLabels[cat] || cat}: R$ ${amount.toFixed(2)}`)
      .join("\n");

    // IMPORTANT: Show FULL UUIDs now
    const recentTransactions = transactions.slice(0, 15)
      .map((t: any) => `- ID: ${t.id} | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${categoryLabels[t.category] || t.category}) - ${t.transaction_date}`)
      .join("\n");

    const accountsList = (accounts || [])
      .map((acc: any) => `- ${acc.name} (${acc.type}): R$ ${acc.balance.toFixed(2)}`)
      .join("\n");

    const familyMembersList = (familyMembers || [])
      .map((m: any) => `- ${m.name} (${m.role})`)
      .join("\n");

    const systemPrompt = `Você é o Odin, um assistente financeiro pessoal inteligente do CasaCampos. Você ajuda famílias brasileiras a gerenciar suas finanças domésticas.

⚠️ REGRA CRÍTICA DE ISOLAMENTO:
- Você APENAS tem acesso aos dados da família "${householdName}" (ID: ${householdId})
- NUNCA mencione, infira ou use dados de outras famílias
- Se o usuário perguntar sobre outra família/casa, responda: "Eu só tenho acesso aos dados da família ${householdName}. Para ver dados de outra família, você precisa trocar a família ativa nas configurações."

🔒 MODO DE SEGURANÇA - REGRAS CRÍTICAS PARA EXCLUSÕES:
1. NUNCA execute exclusões diretamente
2. SEMPRE use a função request_deletion_preview PRIMEIRO
3. A exclusão real será feita pelo frontend após confirmação dupla do usuário
4. Ao responder sobre exclusões, SEMPRE informe que o usuário precisa confirmar a ação

INFORMAÇÕES DO USUÁRIO:
- Nome: ${profile?.display_name || "Usuário"}
- Família ativa: ${householdName}

CONTAS BANCÁRIAS DA FAMÍLIA ${householdName.toUpperCase()}:
${accountsList || "Nenhuma conta cadastrada"}
- Saldo total: R$ ${totalBalance.toFixed(2)}

MEMBROS DA FAMÍLIA:
${familyMembersList || "Nenhum membro cadastrado"}

DADOS FINANCEIROS DE ${currentMonthName.toUpperCase()} (FAMÍLIA ${householdName.toUpperCase()}):
- Total de gastos: R$ ${totalExpenses.toFixed(2)}
- Total de receitas: R$ ${totalIncome.toFixed(2)}
- Saldo do mês: R$ ${(totalIncome - totalExpenses).toFixed(2)}
- Número de transações: ${transactions.length}

COMPARAÇÃO COM ${lastMonthName.toUpperCase()}:
- Gastos do mês passado: R$ ${lastMonthExpenses.toFixed(2)}
- Variação: ${lastMonthExpenses > 0 ? ((totalExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1) : 0}%

GASTOS POR CATEGORIA:
${categoryBreakdown || "Nenhum gasto registrado ainda"}

TRANSAÇÕES RECENTES (com UUIDs completos):
${recentTransactions || "Nenhuma transação registrada"}

DESPESAS RECORRENTES:
${recurringExpenses.length > 0 ? recurringExpenses.map((t: any) => `- ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)}`).join("\n") : "Nenhuma despesa recorrente"}

COMO USAR AS FUNÇÕES:
- Para ADICIONAR: Use a função add_transaction
- Para EDITAR: Use a função update_transaction com o ID COMPLETO (UUID)
- Para EXCLUIR: Use a função request_deletion_preview - isso mostrará um preview e o usuário confirmará

⚠️ IMPORTANTE SOBRE IDs:
- Use SEMPRE o UUID completo (ex: 550e8400-e29b-41d4-a716-446655440000)
- NUNCA use IDs truncados (ex: 550e8400)
- Se não encontrar o ID exato, peça ao usuário para especificar

INSTRUÇÕES:
1. Seja amigável, use emojis ocasionalmente
2. Baseie suas respostas APENAS nos dados da família ${householdName}
3. Use as FUNÇÕES disponíveis para ações
4. Sempre confirme a ação executada ao usuário
5. Use formatação markdown
6. Responda em português brasileiro
7. Valores de gastos devem ser NEGATIVOS
8. NUNCA invente dados
9. Para exclusões, SEMPRE mencione que o Modo de Segurança está ativo`;

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
        tools: aiTools,
        tool_choice: "auto",
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

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = "";
    let toolCalls: any[] = [];
    let currentToolCall: any = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(value);
            
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const json = JSON.parse(line.slice(6));
                  const delta = json.choices?.[0]?.delta;
                  
                  if (delta?.content) {
                    fullContent += delta.content;
                  }
                  
                  // Handle tool calls
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      if (tc.index !== undefined) {
                        if (!toolCalls[tc.index]) {
                          toolCalls[tc.index] = { id: tc.id, function: { name: "", arguments: "" } };
                        }
                        if (tc.function?.name) {
                          toolCalls[tc.index].function.name = tc.function.name;
                        }
                        if (tc.function?.arguments) {
                          toolCalls[tc.index].function.arguments += tc.function.arguments;
                        }
                      }
                    }
                  }
                } catch { /* ignore parse errors */ }
              }
            }
          }

          // Process tool calls after streaming completes
          for (const toolCall of toolCalls) {
            if (!toolCall?.function?.name) continue;
            
            let result: any;
            let args: any = {};
            
            try {
              args = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              console.error("Failed to parse tool args:", toolCall.function.arguments);
              continue;
            }

            console.log(`Executing tool: ${toolCall.function.name}`, args);

            switch (toolCall.function.name) {
              case "add_transaction":
                result = await addTransaction(supabase, user.id, householdId, args);
                break;

              case "update_transaction":
                if (!args.id || !UUID_REGEX.test(args.id)) {
                  result = { success: false, message: `ID inválido: "${args.id}". Use o UUID completo.` };
                } else {
                  result = await updateTransaction(supabase, householdId, args.id, args);
                }
                break;

              case "request_deletion_preview":
                const preview = await previewDeletion(supabase, householdId, args);
                // Send special message for frontend to handle
                const previewMsg = preview.success && preview.count > 0
                  ? `\n\n🔒 **Modo de Segurança Ativado**\n\n` +
                    `Encontrei **${preview.count} lançamentos** para exclusão (${preview.rangeLabel}).\n` +
                    `💰 Valor total: R$ ${preview.sumAmount.toFixed(2)}\n\n` +
                    `${preview.topCategories.length > 0 ? `📊 Categorias: ${preview.topCategories.map(c => `${c.name} (${c.count})`).join(", ")}\n\n` : ""}` +
                    `⚠️ **Esta ação não pode ser desfeita.**\n\n` +
                    `Para confirmar, clique no botão de exclusão que apareceu abaixo.\n\n` +
                    `<!-- DELETION_PREVIEW:${JSON.stringify({
                      count: preview.count,
                      transactionIds: preview.transactionIds,
                      sumAmount: preview.sumAmount,
                      rangeLabel: preview.rangeLabel,
                      topCategories: preview.topCategories,
                      householdId,
                      householdName,
                    })} -->`
                  : `\n\n${preview.message}`;
                
                const previewResult = `data: ${JSON.stringify({
                  choices: [{ delta: { content: previewMsg } }]
                })}\n\n`;
                controller.enqueue(encoder.encode(previewResult));
                continue; // Don't add standard result message

              default:
                result = { success: false, message: "Função não reconhecida" };
            }

            // Send action result as message
            if (result) {
              const icon = result.success ? "✅" : "❌";
              const actionResult = `data: ${JSON.stringify({
                choices: [{ delta: { content: `\n\n${icon} ${result.message}` } }]
              })}\n\n`;
              controller.enqueue(encoder.encode(actionResult));
            }
          }

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
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
