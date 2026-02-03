import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIZE_URL = "https://ldpkatiahdlzbpuvuscd.supabase.co/functions/v1/categorize-transaction";

async function recategorizeTransactions(supabase: any, userId: string, apiKey: string): Promise<{ updated: number; total: number }> {
  // Get all transactions
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, category")
    .eq("user_id", userId);

  if (error || !transactions || transactions.length === 0) {
    return { updated: 0, total: 0 };
  }

  // Send to AI for batch categorization
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

  // Update transactions where category changed
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

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with user's token
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify user token
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

    // Check if user wants to categorize transactions
    const wantsCategorization = lastMessage.includes("categorizar") || 
                                lastMessage.includes("categorize") ||
                                lastMessage.includes("organizar categoria") ||
                                lastMessage.includes("classificar");

    let categorizationResult: { updated: number; total: number } | null = null;
    if (wantsCategorization) {
      categorizationResult = await recategorizeTransactions(supabase, user.id, LOVABLE_API_KEY);
    }

    // Fetch user's transaction data for context
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Get current month transactions
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];
    
    const { data: currentMonthTxs } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .gte("transaction_date", startOfMonth)
      .lte("transaction_date", endOfMonth)
      .order("transaction_date", { ascending: false });

    // Get last month transactions for comparison
    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split("T")[0];
    const endOfLastMonth = new Date(currentYear, currentMonth, 0).toISOString().split("T")[0];
    
    const { data: lastMonthTxs } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .gte("transaction_date", startOfLastMonth)
      .lte("transaction_date", endOfLastMonth);

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    // Calculate statistics
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

    // Group by category
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

    // Find recurring expenses
    const recurringExpenses = transactions.filter((t: any) => t.is_recurring);

    // Build context for AI
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

    const recentTransactions = transactions.slice(0, 10)
      .map((t: any) => `- ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${categoryLabels[t.category] || t.category})`)
      .join("\n");

    // Categorization info if executed
    const categorizationInfo = categorizationResult 
      ? `\n\nAÇÃO EXECUTADA - CATEGORIZAÇÃO AUTOMÁTICA:
- Total de transações analisadas: ${categorizationResult.total}
- Transações recategorizadas: ${categorizationResult.updated}
- ${categorizationResult.updated > 0 ? "As categorias foram atualizadas com sucesso!" : "Todas as transações já estavam bem categorizadas."}`
      : "";

    const systemPrompt = `Você é a Clara, uma assistente financeira pessoal amigável e inteligente do CasaClara. Você ajuda famílias brasileiras a gerenciar suas finanças domésticas.

INFORMAÇÕES DO USUÁRIO:
- Nome: ${profile?.display_name || "Usuário"}

DADOS FINANCEIROS DE ${currentMonthName.toUpperCase()}:
- Total de gastos: R$ ${totalExpenses.toFixed(2)}
- Total de receitas: R$ ${totalIncome.toFixed(2)}
- Saldo: R$ ${(totalIncome - totalExpenses).toFixed(2)}
- Número de transações: ${transactions.length}

COMPARAÇÃO COM ${lastMonthName.toUpperCase()}:
- Gastos do mês passado: R$ ${lastMonthExpenses.toFixed(2)}
- Variação: ${lastMonthExpenses > 0 ? ((totalExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1) : 0}%

GASTOS POR CATEGORIA:
${categoryBreakdown || "Nenhum gasto registrado ainda"}

TRANSAÇÕES RECENTES:
${recentTransactions || "Nenhuma transação registrada"}

DESPESAS RECORRENTES:
${recurringExpenses.length > 0 ? recurringExpenses.map((t: any) => `- ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)}`).join("\n") : "Nenhuma despesa recorrente"}
${categorizationInfo}

INSTRUÇÕES:
1. Seja amigável, use emojis ocasionalmente para tornar a conversa leve
2. Baseie suas respostas nos dados reais do usuário
3. Ofereça dicas práticas e personalizadas de economia
4. Se o usuário não tem dados, incentive-o a registrar seus gastos
5. Use formatação markdown para destacar números importantes
6. Seja concisa mas informativa
7. Sempre responda em português brasileiro
8. Use "**texto**" para destacar valores e informações importantes
9. Se uma ação de categorização foi executada, informe o resultado ao usuário de forma clara e amigável`;

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

    return new Response(response.body, {
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
