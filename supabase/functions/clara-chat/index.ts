import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ========================================================================
// SECURITY: FORBIDDEN OPERATIONS LIST
// These operations are NEVER allowed via Odin, regardless of user request
// ========================================================================
const FORBIDDEN_OPERATIONS = [
  "delete_household", "delete_family", "remove_household", "remove_family",
  "delete_user", "remove_user", "block_user", "unblock_user",
  "change_role", "set_role", "promote_admin", "revoke_admin",
  "change_owner", "transfer_ownership", "deactivate_household",
  "restore_household", "admin_action", "super_admin_action",
];

// Patterns that indicate forbidden requests in user messages
const FORBIDDEN_PATTERNS = [
  /apag(ar|ue|a)\s*(essa?\s*)?(casa|família|household)/i,
  /delet(ar|e)\s*(essa?\s*)?(casa|família|household)/i,
  /remov(er|a)\s*(essa?\s*)?(casa|família|household)/i,
  /exclu(ir|a)\s*(essa?\s*)?(casa|família|household)/i,
  /apag(ar|ue|a)\s*(o\s*)?usuário/i,
  /delet(ar|e)\s*(o\s*)?usuário/i,
  /remov(er|a)\s*(o\s*)?usuário/i,
  /exclu(ir|a)\s*(o\s*)?usuário/i,
  /apag(ar|ue|a)\s*todos?\s*(os\s*)?usuários/i,
  /bloqu(ear|eie)\s*(o\s*)?usuário/i,
  /desbloqu(ear|eie)\s*(o\s*)?usuário/i,
  /mudar?\s*(o\s*)?role/i,
  /alterar?\s*(a\s*)?permiss(ão|ões)/i,
  /promov(er|a)\s*(a\s*)?admin/i,
];

// Security response for forbidden operations
const FORBIDDEN_RESPONSE = `🔒 **Operação Bloqueada por Segurança**

Desculpe, mas eu **não posso** executar ações relacionadas a:
- Excluir/remover famílias ou casas
- Excluir/remover/bloquear usuários
- Alterar permissões ou roles de usuários
- Transferir propriedade de famílias

Essas operações são restritas por segurança e só podem ser realizadas por:
- **Super Administradores** através do Painel Admin
- **Suporte técnico** em casos especiais

📧 Se você precisa realizar uma dessas ações, entre em contato com o administrador do sistema ou suporte.

Posso te ajudar com outras coisas, como gerenciar seus **lançamentos financeiros**! 💰`;

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

// Check if user message contains forbidden operation request
function containsForbiddenRequest(message: string): boolean {
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(message));
}

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

// Normalize text for search (remove accents, lowercase)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Preview deletion - returns summary without deleting
// Now supports: specific IDs, description search, category, date range, amount
async function previewDeletion(supabase: any, householdId: string, filters: any): Promise<{
  success: boolean;
  count: number;
  transactionIds: string[];
  sumAmount: number;
  rangeLabel: string;
  topCategories: { name: string; count: number }[];
  sample: { id: string; date: string; amount: number; description: string; category: string }[];
  message: string;
  filterType: "specific" | "category" | "description" | "combined" | "all";
}> {
  // If searching for specific transaction IDs
  if (filters.transactionIds && filters.transactionIds.length > 0) {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, amount, category, transaction_date, description")
      .eq("household_id", householdId)
      .in("id", filters.transactionIds);

    if (error) {
      return {
        success: false,
        count: 0,
        transactionIds: [],
        sumAmount: 0,
        rangeLabel: "",
        topCategories: [],
        sample: [],
        message: `Erro ao buscar: ${error.message}`,
        filterType: "specific",
      };
    }

    const txList = transactions || [];
    return {
      success: true,
      count: txList.length,
      transactionIds: txList.map((t: any) => t.id),
      sumAmount: txList.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0),
      rangeLabel: `${txList.length} lançamento(s) específico(s)`,
      topCategories: [],
      sample: txList.slice(0, 10).map((t: any) => ({
        id: t.id,
        date: t.transaction_date,
        amount: t.amount,
        description: t.description,
        category: categoryLabels[t.category] || t.category,
      })),
      message: txList.length > 0
        ? `Encontrado(s) ${txList.length} lançamento(s) específico(s).`
        : `Lançamento(s) não encontrado(s).`,
      filterType: "specific",
    };
  }

  let query = supabase
    .from("transactions")
    .select("id, amount, category, transaction_date, description")
    .eq("household_id", householdId);

  let rangeLabel = "";
  const labelParts: string[] = [];
  const now = new Date();

  // Apply date filters
  if (filters.month !== undefined && filters.year !== undefined) {
    const start = new Date(filters.year, filters.month, 1).toISOString().split("T")[0];
    const end = new Date(filters.year, filters.month + 1, 0).toISOString().split("T")[0];
    query = query.gte("transaction_date", start).lte("transaction_date", end);
    labelParts.push(`${monthNames[filters.month]}/${filters.year}`);
  } else if (filters.startDate && filters.endDate) {
    query = query.gte("transaction_date", filters.startDate).lte("transaction_date", filters.endDate);
    labelParts.push(`${filters.startDate} a ${filters.endDate}`);
  } else if (filters.specificDate) {
    query = query.eq("transaction_date", filters.specificDate);
    labelParts.push(`dia ${filters.specificDate}`);
  }

  // Apply category filter
  if (filters.category) {
    query = query.eq("category", filters.category);
    labelParts.push(`categoria ${categoryLabels[filters.category] || filters.category}`);
  }

  // Apply amount filter (exact or range)
  if (filters.exactAmount !== undefined) {
    // Match both positive and negative versions
    query = query.or(`amount.eq.${filters.exactAmount},amount.eq.${-filters.exactAmount}`);
    labelParts.push(`valor R$ ${Math.abs(filters.exactAmount).toFixed(2)}`);
  } else if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    if (filters.minAmount !== undefined) {
      query = query.gte("amount", -Math.abs(filters.minAmount));
    }
    if (filters.maxAmount !== undefined) {
      query = query.lte("amount", Math.abs(filters.maxAmount));
    }
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
      sample: [],
      message: `Erro ao buscar: ${error.message}`,
      filterType: "all",
    };
  }

  let txList = transactions || [];

  // Apply description filter (client-side for flexibility)
  if (filters.descriptionMatch) {
    const searchText = normalizeText(filters.descriptionMatch.text || filters.descriptionMatch);
    const mode = filters.descriptionMatch.mode || "CONTAINS";

    txList = txList.filter((t: any) => {
      const desc = normalizeText(t.description || "");
      if (mode === "EQUALS") {
        return desc === searchText;
      }
      return desc.includes(searchText);
    });

    const displayText = typeof filters.descriptionMatch === "string" 
      ? filters.descriptionMatch 
      : filters.descriptionMatch.text;
    labelParts.push(`descrição contendo "${displayText}"`);
  }

  // Determine filter type
  let filterType: "specific" | "category" | "description" | "combined" | "all" = "all";
  if (filters.descriptionMatch && !filters.category && !filters.month) {
    filterType = "description";
  } else if (filters.category && !filters.descriptionMatch) {
    filterType = "category";
  } else if (labelParts.length > 1) {
    filterType = "combined";
  }

  // Build range label
  rangeLabel = labelParts.length > 0 ? labelParts.join(", ") : "todos os lançamentos";

  const transactionIds = txList.map((t: any) => t.id);
  const sumAmount = txList.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

  // Count by category
  const categoryCount: Record<string, number> = {};
  txList.forEach((t: any) => {
    const cat = categoryLabels[t.category] || t.category;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Sample of transactions for preview
  const sample = txList.slice(0, 10).map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    amount: t.amount,
    description: t.description,
    category: categoryLabels[t.category] || t.category,
  }));

  return {
    success: true,
    count: txList.length,
    transactionIds,
    sumAmount,
    rangeLabel,
    topCategories,
    sample,
    message: txList.length > 0
      ? `Encontrado(s) ${txList.length} lançamento(s) (${rangeLabel}).`
      : `Nenhum lançamento encontrado para os filtros especificados.`,
    filterType,
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

// ========================================================================
// SECURITY: SAFE TOOLS ALLOWLIST
// Only these tools are available to Odin - NO admin/destructive operations
// ========================================================================
const aiTools = [
  {
    type: "function",
    function: {
      name: "add_transaction",
      description: "Adicionar um novo lançamento financeiro. Use para gastos (amount negativo) ou receitas (amount positivo). APENAS para a família ativa.",
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
      description: "Atualizar um lançamento existente usando o ID completo (UUID). APENAS para a família ativa.",
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
      name: "search_transactions",
      description: "Buscar lançamentos por descrição, valor, data ou categoria. Use para encontrar um lançamento específico antes de editar ou excluir.",
      parameters: {
        type: "object",
        properties: {
          descriptionMatch: { type: "string", description: "Texto para buscar na descrição (case-insensitive, ignora acentos)" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
          exactAmount: { type: "number", description: "Valor exato a buscar (positivo)" },
          specificDate: { type: "string", description: "Data específica YYYY-MM-DD" },
          month: { type: "integer", description: "Mês (0-11)" },
          year: { type: "integer", description: "Ano" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 10)", default: 10 },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_deletion_preview",
      description: `Preview de exclusão de LANÇAMENTOS. Use para exclusão SELETIVA:
      
      Tipo A - Lançamento específico: Use transactionIds com UUIDs específicos
      Tipo B - Por categoria: Use category + período opcional
      Tipo C - Por descrição: Use descriptionMatch com texto a buscar
      Tipo D - Combinado: Use múltiplos filtros juntos
      
      NUNCA use esta função sem filtros específicos - isso excluiria tudo!
      Se o usuário pedir "apagar este lançamento específico", primeiro use search_transactions para encontrar o ID.`,
      parameters: {
        type: "object",
        properties: {
          transactionIds: { 
            type: "array", 
            items: { type: "string" },
            description: "Lista de UUIDs específicos para excluir (Tipo A - exclusão de lançamentos específicos)" 
          },
          descriptionMatch: { 
            type: "string", 
            description: "Texto para buscar na descrição (Tipo C - exclusão por descrição). Case-insensitive, ignora acentos." 
          },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"], description: "Filtrar por categoria (Tipo B)" },
          month: { type: "integer", description: "Mês (0-11). 0=Janeiro, 11=Dezembro" },
          year: { type: "integer", description: "Ano (ex: 2026)" },
          specificDate: { type: "string", description: "Data específica YYYY-MM-DD" },
          startDate: { type: "string", description: "Data inicial YYYY-MM-DD" },
          endDate: { type: "string", description: "Data final YYYY-MM-DD" },
          exactAmount: { type: "number", description: "Valor exato a buscar" },
        },
        required: [],
      },
    },
  },
];

// NOTE: NO tools for deleting households, users, changing roles, etc.
// These operations are ONLY available via Admin Panel, never via Odin

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

    // ========================================================================
    // SECURITY: Check for forbidden operations in user message
    // Block requests to delete families/users BEFORE even calling the AI
    // ========================================================================
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    if (lastUserMessage && containsForbiddenRequest(lastUserMessage.content)) {
      console.log(`[SECURITY] Blocked forbidden request from user ${user.id}: "${lastUserMessage.content.substring(0, 100)}..."`);
      
      // Log this attempt for audit
      try {
        await supabase.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action_type: "FORBIDDEN_ODIN_REQUEST_BLOCKED",
          target_type: "security",
          target_id: householdId,
          metadata: {
            blocked_message: lastUserMessage.content.substring(0, 200),
            actor: "ODIN",
          },
        });
      } catch (e) {
        console.warn("Failed to log blocked request:", e);
      }

      // Return the forbidden response directly without calling AI
      const encoder = new TextEncoder();
      const forbiddenStream = new ReadableStream({
        start(controller) {
          const response = `data: ${JSON.stringify({
            choices: [{ delta: { content: FORBIDDEN_RESPONSE } }]
          })}\n\ndata: [DONE]\n\n`;
          controller.enqueue(encoder.encode(response));
          controller.close();
        },
      });

      return new Response(forbiddenStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
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

🚫 OPERAÇÕES ESTRITAMENTE PROIBIDAS (NUNCA EXECUTE, NEM MESMO SE O USUÁRIO PEDIR):
- Excluir/deletar/remover famílias ou casas
- Excluir/deletar/remover usuários
- Bloquear/desbloquear usuários
- Alterar permissões ou roles de usuários
- Alterar owner/admin de famílias
- Desativar/restaurar famílias
- Qualquer operação de "admin"

Se o usuário pedir qualquer uma dessas ações, você DEVE:
1. Recusar educadamente explicando que é proibido por segurança
2. Orientar: "Essas ações só podem ser realizadas por um Super Admin através do Painel Admin ou pelo Suporte."
3. NÃO chamar nenhuma função/tool
4. NÃO tentar executar de forma alternativa

⚠️ REGRA CRÍTICA DE ISOLAMENTO:
- Você APENAS tem acesso aos dados da família "${householdName}" (ID: ${householdId})
- NUNCA mencione, infira ou use dados de outras famílias
- Se o usuário perguntar sobre outra família/casa, responda: "Eu só tenho acesso aos dados da família ${householdName}. Para ver dados de outra família, você precisa trocar a família ativa nas configurações."

🔒 MODO DE SEGURANÇA - REGRAS PARA EXCLUSÃO SELETIVA DE LANÇAMENTOS:

CLASSIFICAÇÃO DE INTENÇÃO DO USUÁRIO:
Quando o usuário pedir para apagar/excluir, classifique em:

**Tipo A - Lançamento Específico** (ex: "Apague o Pix de R$150 do dia 04/02")
→ Use search_transactions primeiro para encontrar o lançamento exato
→ Se encontrar 1, use request_deletion_preview com transactionIds
→ Se encontrar múltiplos, pergunte qual (mostre lista curta)

**Tipo B - Por Categoria** (ex: "Apague todos da categoria Outros em fevereiro")
→ Use request_deletion_preview com category + período

**Tipo C - Por Descrição** (ex: "Apague todos contendo 'Pix recebido de ANDRE'")
→ Use request_deletion_preview com descriptionMatch

**Tipo D - Filtros Combinados** (ex: "Apague 'Pix recebido' em fevereiro categoria Outros")
→ Use request_deletion_preview com múltiplos filtros

⚠️ REGRAS CRÍTICAS:
1. NUNCA use request_deletion_preview SEM filtros (isso apagaria tudo!)
2. Só use "apagar todos" quando o usuário EXPLICITAMENTE pedir
3. Para pedidos específicos, SEMPRE priorize Tipo A (buscar primeiro)
4. Se encontrar muitos resultados (>20), pergunte se quer restringir mais
5. SEMPRE mostre preview antes da exclusão real
6. A exclusão real será feita pelo frontend após confirmação dupla

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

SUAS FUNÇÕES DISPONÍVEIS (APENAS ESTAS):
- add_transaction: Adicionar lançamento financeiro
- update_transaction: Editar lançamento existente (com UUID completo)
- search_transactions: Buscar lançamentos por descrição, valor, data ou categoria
- request_deletion_preview: Preview de exclusão SELETIVA de lançamentos

⚠️ IMPORTANTE SOBRE IDs:
- Use SEMPRE o UUID completo (ex: 550e8400-e29b-41d4-a716-446655440000)
- NUNCA use IDs truncados (ex: 550e8400)
- Se não encontrar o ID exato, use search_transactions para buscar

INSTRUÇÕES:
1. Seja amigável, use emojis ocasionalmente
2. Baseie suas respostas APENAS nos dados da família ${householdName}
3. Use as FUNÇÕES disponíveis para ações de lançamentos APENAS
4. Sempre confirme a ação executada ao usuário
5. Use formatação markdown
6. Responda em português brasileiro
7. Valores de gastos devem ser NEGATIVOS
8. NUNCA invente dados
9. Para exclusões, SEMPRE mencione que o Modo de Segurança está ativo
10. NUNCA tente excluir famílias ou usuários - essas operações são bloqueadas
11. Para exclusões específicas, use search_transactions PRIMEIRO para encontrar o ID`;

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

              case "search_transactions":
                // Search for transactions matching filters
                const searchResult = await previewDeletion(supabase, householdId, args);
                if (searchResult.success && searchResult.count > 0) {
                  const limit = args.limit || 10;
                  const sampleList = searchResult.sample.slice(0, limit)
                    .map((t: any) => `- **${t.date}** | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${t.category}) [ID: ${t.id}]`)
                    .join("\n");
                  
                  const searchMsg = `\n\n🔍 **Encontrei ${searchResult.count} lançamento(s)**:\n\n${sampleList}${searchResult.count > limit ? `\n\n_...e mais ${searchResult.count - limit} resultados._` : ""}\n`;
                  
                  const searchResultMsg = `data: ${JSON.stringify({
                    choices: [{ delta: { content: searchMsg } }]
                  })}\n\n`;
                  controller.enqueue(encoder.encode(searchResultMsg));
                } else {
                  const noResultMsg = `data: ${JSON.stringify({
                    choices: [{ delta: { content: `\n\n🔍 Nenhum lançamento encontrado com esses filtros.\n` } }]
                  })}\n\n`;
                  controller.enqueue(encoder.encode(noResultMsg));
                }
                continue;

              case "request_deletion_preview":
                // Validate that filters are provided (never delete all without explicit filters)
                const hasFilters = args.transactionIds || args.descriptionMatch || args.category || 
                  args.month !== undefined || args.year !== undefined || 
                  args.startDate || args.endDate || args.specificDate || args.exactAmount;
                
                if (!hasFilters) {
                  const warningMsg = `data: ${JSON.stringify({
                    choices: [{ delta: { content: `\n\n⚠️ **Atenção**: Você não especificou filtros. Isso apagaria TODOS os lançamentos!\n\nPor favor, especifique:\n- Um período (mês/ano ou datas)\n- Uma categoria\n- Uma descrição para buscar\n- Ou um lançamento específico\n` } }]
                  })}\n\n`;
                  controller.enqueue(encoder.encode(warningMsg));
                  continue;
                }

                const preview = await previewDeletion(supabase, householdId, args);
                
                // Build sample list for preview
                const samplePreview = preview.sample && preview.sample.length > 0
                  ? `\n📋 **Exemplos de lançamentos afetados:**\n${preview.sample.slice(0, 5).map((t: any) => 
                      `- ${t.date} | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${t.category})`
                    ).join("\n")}\n${preview.count > 5 ? `\n_...e mais ${preview.count - 5} lançamentos._\n` : ""}`
                  : "";

                const previewMsg = preview.success && preview.count > 0
                  ? `\n\n🔒 **Modo de Segurança Ativado**\n\n` +
                    `Encontrei **${preview.count} lançamento(s)** para exclusão (${preview.rangeLabel}).\n` +
                    `💰 Valor total: R$ ${preview.sumAmount.toFixed(2)}\n` +
                    `${preview.topCategories.length > 0 ? `\n📊 Categorias: ${preview.topCategories.map(c => `${c.name} (${c.count})`).join(", ")}\n` : ""}` +
                    `${samplePreview}\n` +
                    `⚠️ **Esta ação não pode ser desfeita.**\n\n` +
                    `Para confirmar, clique no botão de exclusão que apareceu abaixo.\n\n` +
                    `<!-- DELETION_PREVIEW:${JSON.stringify({
                      count: preview.count,
                      transactionIds: preview.transactionIds,
                      sumAmount: preview.sumAmount,
                      rangeLabel: preview.rangeLabel,
                      topCategories: preview.topCategories,
                      sample: preview.sample,
                      householdId,
                      householdName,
                    })} -->`
                  : `\n\n${preview.message}`;
                
                const previewResult = `data: ${JSON.stringify({
                  choices: [{ delta: { content: previewMsg } }]
                })}\n\n`;
                controller.enqueue(encoder.encode(previewResult));
                continue;

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
