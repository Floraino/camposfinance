import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ========================================================================
// SECURITY: FORBIDDEN OPERATIONS LIST
// ========================================================================
const FORBIDDEN_PATTERNS = [
  /apag(ar|ue|a)\s*(essa?\s*)?(casa|família|household)/i,
  /delet(ar|e)\s*(essa?\s*)?(casa|família|household)/i,
  /remov(er|a)\s*(essa?\s*)?(casa|família|household)/i,
  /exclu(ir|a)\s*(essa?\s*)?(casa|família|household)/i,
  /apag(ar|ue|a)\s*(o\s*)?usuário/i,
  /delet(ar|e)\s*(o\s*)?usuário/i,
  /remov(er|a)\s*(o\s*)?usuário/i,
  /exclu(ir|a)\s*(o\s*)?usuário/i,
  /bloqu(ear|eie)\s*(o\s*)?usuário/i,
  /desbloqu(ear|eie)\s*(o\s*)?usuário/i,
  /mudar?\s*(o\s*)?role/i,
  /alterar?\s*(a\s*)?permiss(ão|ões)/i,
  /promov(er|a)\s*(a\s*)?admin/i,
];

const FORBIDDEN_RESPONSE = `🔒 **Operação Bloqueada por Segurança**

Desculpe, mas eu **não posso** executar ações relacionadas a:
- Excluir/remover famílias ou casas
- Excluir/remover/bloquear usuários
- Alterar permissões ou roles de usuários

Essas operações são restritas por segurança e só podem ser realizadas por:
- **Super Administradores** através do Painel Admin
- **Suporte técnico** em casos especiais

Posso te ajudar com outras coisas, como gerenciar seus **lançamentos financeiros**! 💰`;

// Category labels for display (fixas). Custom categories merged at runtime per household.
const categoryLabels: Record<string, string> = {
  food: "Alimentação",
  transport: "Transporte",
  leisure: "Lazer",
  entertainment: "Lazer",
  health: "Saúde",
  education: "Educação",
  shopping: "Compras",
  bills: "Contas Fixas",
  other: "Outros",
};

async function getCategoryLabelsForHousehold(supabase: any, householdId: string): Promise<Record<string, string>> {
  const base = { ...categoryLabels };
  const { data: custom } = await supabase
    .from("household_categories")
    .select("id, name")
    .eq("household_id", householdId)
    .eq("is_archived", false);
  if (custom && Array.isArray(custom)) {
    for (const c of custom) {
      base[`custom:${c.id}`] = c.name;
    }
  }
  return base;
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function containsForbiddenRequest(message: string): boolean {
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(message));
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ========================================================================
// TRANSACTION FUNCTIONS
// ========================================================================

// Whitelist of valid transaction fields (same as import-csv)
const VALID_TRANSACTION_FIELDS_CLARA = new Set([
  "user_id",
  "household_id",
  "description",
  "amount",
  "category",
  "status",
  "transaction_date",
  "notes",
  "is_recurring",
  "account_id",
  "credit_card_id",
  "member_id",
  "due_date",
  "installment_group_id",
  "installment_number",
  "attachments",
  "created_at",
  "updated_at",
  // Explicitly excluded: payment_method (removed from schema)
]);

function sanitizeTransactionClara(tx: any): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(tx)) {
    // Skip payment_method explicitly (even if it somehow got into the object)
    if (key === 'payment_method' || key === 'paymentMethod') {
      continue;
    }
    if (VALID_TRANSACTION_FIELDS_CLARA.has(key)) {
      sanitized[key] = value;
    }
  }
  
  // Final safety check: explicitly delete payment_method if it somehow exists
  delete sanitized.payment_method;
  delete sanitized.paymentMethod;
  return sanitized;
}

async function addTransaction(supabase: any, userId: string, householdId: string, data: any) {
  const insertData = {
    user_id: userId,
    household_id: householdId,
    description: data.description,
    amount: data.amount,
    category: data.category || "other",
    status: data.status || "paid",
    is_recurring: data.is_recurring || false,
    transaction_date: data.transaction_date || new Date().toISOString().split("T")[0],
    notes: data.notes,
    member_id: data.member_id,
  };
  
  // Sanitize to ensure no extra fields (e.g., payment_method) are included
  const sanitizedData = sanitizeTransactionClara(insertData);
  
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert(sanitizedData)
    .select()
    .single();

  if (error) {
    return { success: false, message: `Erro ao adicionar: ${error.message}` };
  }
  return { success: true, message: "Transação adicionada com sucesso!", transaction: tx };
}

async function updateTransaction(supabase: any, householdId: string, id: string, data: any) {
  if (!UUID_REGEX.test(id)) {
    return { success: false, message: `ID inválido: "${id}" não é um UUID válido.` };
  }

  const updates: any = {};
  if (data.description) updates.description = data.description;
  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.category) updates.category = data.category;
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

// ========================================================================
// CATEGORIZATION RULES FUNCTIONS
// ========================================================================

async function createCategorizationRule(supabase: any, userId: string, householdId: string, data: any, labels?: Record<string, string>) {
  const L = labels || categoryLabels;
  const { data: rule, error } = await supabase
    .from("categorization_rules")
    .insert({
      household_id: householdId,
      created_by: userId,
      pattern: data.pattern,
      category: data.category,
      match_type: data.match_type || "contains",
      account_id: data.account_id || null,
      priority: data.priority || 0,
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: `Erro ao criar regra: ${error.message}` };
  }
  return { 
    success: true, 
    message: `✅ Regra criada! Lançamentos contendo "${data.pattern}" serão categorizados como ${L[data.category] || data.category}.`,
    rule 
  };
}

async function listCategorizationRules(supabase: any, householdId: string) {
  const { data: rules, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (error) {
    return { success: false, message: `Erro ao buscar regras: ${error.message}`, rules: [] };
  }
  return { success: true, rules: rules || [] };
}

async function applyCategoryToTransactions(supabase: any, householdId: string, pattern: string, category: string, labels?: Record<string, string>) {
  const L = labels || categoryLabels;
  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("household_id", householdId)
    .eq("category", "other");

  if (!transactions || transactions.length === 0) {
    return { success: true, count: 0, message: "Nenhum lançamento sem categoria encontrado." };
  }

  const normalizedPattern = normalizeText(pattern);
  const toUpdate = transactions.filter((t: any) => 
    normalizeText(t.description || "").includes(normalizedPattern)
  );

  if (toUpdate.length === 0) {
    return { success: true, count: 0, message: `Nenhum lançamento encontrado contendo "${pattern}".` };
  }

  const ids = toUpdate.map((t: any) => t.id);
  const { error } = await supabase
    .from("transactions")
    .update({ category })
    .in("id", ids);

  if (error) {
    return { success: false, count: 0, message: `Erro ao atualizar: ${error.message}` };
  }

  return { 
    success: true, 
    count: toUpdate.length, 
    message: `✅ ${toUpdate.length} lançamento(s) atualizado(s) para categoria ${L[category] || category}.`
  };
}

// ========================================================================
// CATEGORY BUDGETS FUNCTIONS
// ========================================================================

async function createCategoryBudget(supabase: any, userId: string, householdId: string, data: any, labels?: Record<string, string>) {
  const L = labels || categoryLabels;
  const now = new Date();
  const month = data.month ?? now.getMonth();
  const year = data.year ?? now.getFullYear();

  // Check if budget already exists
  const { data: existing } = await supabase
    .from("category_budgets")
    .select("id")
    .eq("household_id", householdId)
    .eq("category", data.category)
    .eq("month", month)
    .eq("year", year)
    .single();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from("category_budgets")
      .update({ amount: data.amount, alert_threshold: data.alert_threshold || 80 })
      .eq("id", existing.id);

    if (error) {
      return { success: false, message: `Erro ao atualizar meta: ${error.message}` };
    }
    return { 
      success: true, 
      message: `✅ Meta atualizada! ${L[data.category] || data.category}: R$ ${data.amount.toFixed(2)} para ${monthNames[month]}/${year}.`
    };
  }

  const { error } = await supabase
    .from("category_budgets")
    .insert({
      household_id: householdId,
      created_by: userId,
      category: data.category,
      amount: data.amount,
      month,
      year,
      alert_threshold: data.alert_threshold || 80,
    });

  if (error) {
    return { success: false, message: `Erro ao criar meta: ${error.message}` };
  }

  return { 
    success: true, 
    message: `✅ Meta criada! ${L[data.category] || data.category}: R$ ${data.amount.toFixed(2)} para ${monthNames[month]}/${year}.`
  };
}

async function getCategoryBudgetProgress(supabase: any, householdId: string) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Get budgets for current month
  const { data: budgets } = await supabase
    .from("category_budgets")
    .select("*")
    .eq("household_id", householdId)
    .eq("month", month)
    .eq("year", year);

  if (!budgets || budgets.length === 0) {
    return { success: true, budgets: [], message: "Nenhuma meta definida para este mês." };
  }

  // Get spending by category
  const startOfMonth = new Date(year, month, 1).toISOString().split("T")[0];
  const endOfMonth = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const { data: transactions } = await supabase
    .from("transactions")
    .select("category, amount")
    .eq("household_id", householdId)
    .lt("amount", 0)
    .gte("transaction_date", startOfMonth)
    .lte("transaction_date", endOfMonth);

  const spendingByCategory: Record<string, number> = {};
  (transactions || []).forEach((t: any) => {
    spendingByCategory[t.category] = (spendingByCategory[t.category] || 0) + Math.abs(t.amount);
  });

  const budgetsWithProgress = budgets.map((b: any) => {
    const spent = spendingByCategory[b.category] || 0;
    const percentage = (spent / b.amount) * 100;
    return {
      ...b,
      spent,
      percentage: Math.round(percentage),
      status: percentage >= 100 ? "exceeded" : percentage >= b.alert_threshold ? "warning" : "ok",
    };
  });

  return { success: true, budgets: budgetsWithProgress };
}

// ========================================================================
// ECONOMY DIAGNOSTIC FUNCTIONS
// ========================================================================

async function analyzeSpendingTrends(supabase: any, householdId: string, labels?: Record<string, string>) {
  const L = labels ?? categoryLabels;
  const now = new Date();
  const results: any = {
    currentMonth: { expenses: 0 },
    lastMonth: { expenses: 0 },
    twoMonthsAgo: { expenses: 0 },
    byCategory: {},
    recurringSubscriptions: [],
    insights: [],
  };

  // Get 3 months of data
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .gte("transaction_date", threeMonthsAgo.toISOString().split("T")[0])
    .order("transaction_date", { ascending: true });

  if (!transactions || transactions.length === 0) {
    return { success: true, ...results, insights: ["📊 Ainda não há dados suficientes para análise."] };
  }

  // Categorize by month
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  transactions.forEach((t: any) => {
    const txDate = new Date(t.transaction_date);
    const txMonth = txDate.getMonth();
    const txYear = txDate.getFullYear();
    const amount = t.amount;

    let period: string;
    if (txMonth === currentMonth && txYear === currentYear) {
      period = "currentMonth";
    } else if ((txMonth === currentMonth - 1 && txYear === currentYear) || (currentMonth === 0 && txMonth === 11 && txYear === currentYear - 1)) {
      period = "lastMonth";
    } else {
      period = "twoMonthsAgo";
    }

    if (amount < 0) {
      results[period].expenses += Math.abs(amount);
      const cat = t.category;
      if (!results.byCategory[cat]) {
        results.byCategory[cat] = { currentMonth: 0, lastMonth: 0, twoMonthsAgo: 0 };
      }
      results.byCategory[cat][period] += Math.abs(amount);
    }
  });

  // Find recurring subscriptions (same description, similar amount, multiple months)
  const descriptionCounts: Record<string, { count: number; amounts: number[]; description: string }> = {};
  transactions.filter((t: any) => t.amount < 0).forEach((t: any) => {
    const key = normalizeText(t.description || "").substring(0, 30);
    if (!descriptionCounts[key]) {
      descriptionCounts[key] = { count: 0, amounts: [], description: t.description };
    }
    descriptionCounts[key].count++;
    descriptionCounts[key].amounts.push(Math.abs(t.amount));
  });

  Object.entries(descriptionCounts).forEach(([key, data]) => {
    if (data.count >= 2) {
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const variation = Math.max(...data.amounts) - Math.min(...data.amounts);
      if (variation < avgAmount * 0.2) { // Less than 20% variation = likely subscription
        results.recurringSubscriptions.push({
          description: data.description,
          avgAmount,
          count: data.count,
        });
      }
    }
  });

  // Generate insights
  const insights: string[] = [];

  // Expense trend
  if (results.lastMonth.expenses > 0) {
    const change = ((results.currentMonth.expenses - results.lastMonth.expenses) / results.lastMonth.expenses) * 100;
    if (change > 10) {
      insights.push(`📈 **Gastos aumentaram ${change.toFixed(0)}%** este mês em relação ao anterior.`);
    } else if (change < -10) {
      insights.push(`📉 **Parabéns!** Gastos diminuíram ${Math.abs(change).toFixed(0)}% este mês.`);
    }
  }

  // Category analysis
  Object.entries(results.byCategory).forEach(([cat, data]: [string, any]) => {
    if (data.lastMonth > 0 && data.currentMonth > data.lastMonth * 1.3) {
      insights.push(`⚠️ **${L[cat] || cat}** aumentou ${((data.currentMonth / data.lastMonth - 1) * 100).toFixed(0)}% este mês.`);
    }
  });

  // Subscriptions
  if (results.recurringSubscriptions.length > 0) {
    const totalRecurring = results.recurringSubscriptions.reduce((sum: number, s: any) => sum + s.avgAmount, 0);
    insights.push(`🔄 Você tem ${results.recurringSubscriptions.length} assinatura(s) recorrente(s) totalizando ~R$ ${totalRecurring.toFixed(2)}/mês.`);
  }

  // Savings suggestions
  const topCategories = Object.entries(results.byCategory)
    .sort((a: any, b: any) => b[1].currentMonth - a[1].currentMonth)
    .slice(0, 3);

  if (topCategories.length > 0) {
    const [topCat, topData] = topCategories[0] as [string, any];
    if (topData.currentMonth > results.currentMonth.expenses * 0.4) {
      insights.push(`💡 **${L[topCat] || topCat}** representa ${((topData.currentMonth / results.currentMonth.expenses) * 100).toFixed(0)}% dos seus gastos. Considere definir uma meta para esta categoria.`);
    }
  }

  results.insights = insights.length > 0 ? insights : ["📊 Seus gastos estão estáveis. Continue monitorando!"];
  return { success: true, ...results };
}

// ========================================================================
// PENDING ITEMS FUNCTIONS
// ========================================================================

async function getPendingItems(supabase: any, householdId: string) {
  const result = {
    uncategorized: 0,
    duplicates: 0,
    pendingSplits: 0,
    noAccount: 0,
    items: [] as any[],
  };

  // Uncategorized transactions
  const { data: uncategorized } = await supabase
    .from("transactions")
    .select("id, description, amount, transaction_date")
    .eq("household_id", householdId)
    .eq("category", "other")
    .limit(20);

  result.uncategorized = (uncategorized || []).length;
  if (result.uncategorized > 0) {
    result.items.push({
      type: "uncategorized",
      count: result.uncategorized,
      message: `${result.uncategorized} lançamento(s) sem categoria definida`,
      action: "categorize",
    });
  }

  // Pending splits
  const { data: splits } = await supabase
    .from("split_participants")
    .select("id, split_event_id, payment_status, split_events!inner(owner_household_id)")
    .eq("split_events.owner_household_id", householdId)
    .neq("payment_status", "PAID");

  result.pendingSplits = (splits || []).length;
  if (result.pendingSplits > 0) {
    result.items.push({
      type: "pending_splits",
      count: result.pendingSplits,
      message: `${result.pendingSplits} participante(s) com pagamento pendente em rateios`,
      action: "view_splits",
    });
  }

  return { success: true, ...result };
}

// ========================================================================
// PREVIEW DELETION
// ========================================================================

async function previewDeletion(supabase: any, householdId: string, filters: any, labels?: Record<string, string>) {
  const L = labels ?? categoryLabels;
  if (filters.transactionIds && filters.transactionIds.length > 0) {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, amount, category, transaction_date, description")
      .eq("household_id", householdId)
      .in("id", filters.transactionIds);

    if (error) {
      return { success: false, count: 0, transactionIds: [], sumAmount: 0, rangeLabel: "", topCategories: [], sample: [], message: error.message, filterType: "specific" };
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
        category: L[t.category] || t.category,
      })),
      message: txList.length > 0 ? `Encontrado(s) ${txList.length} lançamento(s).` : "Nenhum encontrado.",
      filterType: "specific",
    };
  }

  let query = supabase.from("transactions").select("id, amount, category, transaction_date, description").eq("household_id", householdId);
  const labelParts: string[] = [];

  if (filters.month !== undefined && filters.year !== undefined) {
    const start = new Date(filters.year, filters.month, 1).toISOString().split("T")[0];
    const end = new Date(filters.year, filters.month + 1, 0).toISOString().split("T")[0];
    query = query.gte("transaction_date", start).lte("transaction_date", end);
    labelParts.push(`${monthNames[filters.month]}/${filters.year}`);
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
    labelParts.push(`categoria ${L[filters.category] || filters.category}`);
  }

  const { data: transactions, error } = await query;
  if (error) {
    return { success: false, count: 0, transactionIds: [], sumAmount: 0, rangeLabel: "", topCategories: [], sample: [], message: error.message, filterType: "all" };
  }

  let txList = transactions || [];

  if (filters.descriptionMatch) {
    const searchText = normalizeText(filters.descriptionMatch);
    txList = txList.filter((t: any) => normalizeText(t.description || "").includes(searchText));
    labelParts.push(`descrição contendo "${filters.descriptionMatch}"`);
  }

  const rangeLabel = labelParts.length > 0 ? labelParts.join(", ") : "todos os lançamentos";
  const transactionIds = txList.map((t: any) => t.id);
  const sumAmount = txList.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

  const categoryCount: Record<string, number> = {};
  txList.forEach((t: any) => {
    const cat = L[t.category] || t.category;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const topCategories = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  const sample = txList.slice(0, 10).map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    amount: t.amount,
    description: t.description,
    category: L[t.category] || t.category,
  }));

  return { success: true, count: txList.length, transactionIds, sumAmount, rangeLabel, topCategories, sample, message: txList.length > 0 ? `Encontrado(s) ${txList.length} lançamento(s).` : "Nenhum encontrado.", filterType: labelParts.length > 1 ? "combined" : "all" };
}

// ========================================================================
// VALIDATION FUNCTIONS
// ========================================================================

async function validateHouseholdMembership(supabase: any, userId: string, householdId: string): Promise<boolean> {
  const { data, error } = await supabase.from("household_members").select("id").eq("user_id", userId).eq("household_id", householdId).single();
  return !error && !!data;
}

async function getHouseholdName(supabase: any, householdId: string): Promise<string> {
  const { data } = await supabase.from("households").select("name").eq("id", householdId).single();
  return data?.name || "Família";
}

// Normalize category to app schema (entertainment → leisure)
const CATEGORY_ALIAS: Record<string, string> = {
  entertainment: "leisure",
  lazer: "leisure",
  contas: "bills",
};
const VALID_CATEGORIES = new Set(["food", "transport", "bills", "health", "education", "shopping", "leisure", "other"]);

function normalizeCategory(cat: string): string {
  const lower = (cat || "other").toLowerCase().trim();
  return VALID_CATEGORIES.has(lower) ? lower : (CATEGORY_ALIAS[lower] || "other");
}

// List uncategorized expenses and get AI suggestions (categorize-transaction batch)
async function listUncategorizedAndSuggest(
  supabase: any,
  householdId: string,
  authHeader: string,
  options: { from?: string; to?: string; limit?: number } = {}
): Promise<{ transactions: any[]; suggestions: any[]; error?: string }> {
  const limit = Math.min(options.limit ?? 50, 50);
  const toDate = options.to ? new Date(options.to) : new Date();
  const fromDate = options.from ? new Date(options.from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromStr = fromDate.toISOString().split("T")[0];
  const toStr = toDate.toISOString().split("T")[0];

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, amount, transaction_date")
    .eq("household_id", householdId)
    .lt("amount", 0)
    .or("category.is.null,category.eq.other,category.eq.uncategorized")
    .gte("transaction_date", fromStr)
    .lte("transaction_date", toStr)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  if (error) {
    return { transactions: [], suggestions: [], error: error.message };
  }
  const list = transactions || [];
  if (list.length === 0) {
    return { transactions: [], suggestions: [] };
  }

  const descriptions = list.map((t: any) => ({ id: t.id, description: t.description || "" }));
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return { transactions: list, suggestions: [], error: "SUPABASE_URL not set" };
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const res = await fetch(`${supabaseUrl}/functions/v1/categorize-transaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      "apikey": anonKey || "",
    },
    body: JSON.stringify({ categorizeAll: true, descriptions }),
  });
  let categories: Array<{ id: string; category: string; confidence?: number }> = [];
  if (res.ok) {
    try {
      const body = await res.json();
      categories = body.categories || [];
    } catch (_e) {
      /* ignore */
    }
  }

  const suggestions = list.map((t: any) => {
    const sug = categories.find((c: any) => c.id === t.id);
    const category = normalizeCategory(sug?.category || "other");
    const confidence = typeof sug?.confidence === "number" ? sug.confidence : 0.5;
    return {
      transaction_id: t.id,
      description: t.description || "",
      amount: t.amount,
      date: t.transaction_date,
      category,
      confidence,
      reason: confidence >= 0.6 ? "" : "Revisar",
    };
  });
  return { transactions: list, suggestions };
}

// ========================================================================
// AI TOOLS - ENHANCED WITH ACTIONS & DIAGNOSTICS
// ========================================================================

const aiTools = [
  {
    type: "function",
    function: {
      name: "add_transaction",
      description: "Adicionar um novo gasto (despesa). Valor sempre negativo.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Descrição do lançamento" },
          amount: { type: "number", description: "Valor em reais (sempre negativo para despesa)" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
          status: { type: "string", enum: ["paid", "pending"] },
          transaction_date: { type: "string", description: "Data YYYY-MM-DD" },
          notes: { type: "string" },
        },
        required: ["description", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_transaction",
      description: "Atualizar um lançamento existente usando o UUID completo.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "UUID completo do lançamento" },
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Buscar lançamentos por descrição, valor, data ou categoria.",
      parameters: {
        type: "object",
        properties: {
          descriptionMatch: { type: "string", description: "Texto para buscar na descrição" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
          exactAmount: { type: "number" },
          specificDate: { type: "string" },
          month: { type: "integer" },
          year: { type: "integer" },
          limit: { type: "integer", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_deletion_preview",
      description: "Preview de exclusão SELETIVA de lançamentos. NUNCA use sem filtros!",
      parameters: {
        type: "object",
        properties: {
          transactionIds: { type: "array", items: { type: "string" }, description: "UUIDs específicos" },
          descriptionMatch: { type: "string", description: "Texto para buscar" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
          month: { type: "integer" },
          year: { type: "integer" },
        },
      },
    },
  },
  // ========== NEW ACTIONABLE TOOLS ==========
  {
    type: "function",
    function: {
      name: "create_categorization_rule",
      description: "Criar uma regra automática de categorização. Quando uma descrição contiver o padrão, será automaticamente categorizada.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Texto a ser buscado na descrição (ex: 'UBER', 'IFood')" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"], description: "Categoria a aplicar" },
          match_type: { type: "string", enum: ["contains", "exact", "starts_with"], default: "contains" },
        },
        required: ["pattern", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_category_now",
      description: "Aplicar uma categoria a lançamentos existentes que contenham um padrão na descrição. Útil para recategorizar lançamentos em massa.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Texto a buscar na descrição" },
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"], description: "Nova categoria" },
        },
        required: ["pattern", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_category_goal",
      description: "Criar ou atualizar uma meta de gastos para uma categoria. Você será alertado ao atingir o limite.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["food", "transport", "entertainment", "health", "education", "shopping", "bills", "other"] },
          amount: { type: "number", description: "Valor limite em reais" },
          alert_threshold: { type: "integer", description: "Porcentagem para alerta (padrão 80)", default: 80 },
          month: { type: "integer", description: "Mês (0-11), padrão é o mês atual" },
          year: { type: "integer", description: "Ano, padrão é o ano atual" },
        },
        required: ["category", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_goals_progress",
      description: "Verificar o progresso das metas de categorias do mês atual.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_spending",
      description: "Analisar tendências de gastos, identificar assinaturas recorrentes e gerar insights de economia.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_items",
      description: "Verificar pendências: lançamentos sem categoria, duplicados, rateios pendentes.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categorization_rules",
      description: "Listar todas as regras de categorização automática ativas.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ========================================================================
// MAIN SERVER
// ========================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const MANUS_API_KEY = Deno.env.get("MANUS_API_KEY");
    if (!MANUS_API_KEY) {
      return new Response(JSON.stringify({
        error: "Assistente Odin não configurado",
        code: "AI_NOT_CONFIGURED",
        details: "MANUS_API_KEY não está definida. Configure em: Supabase Dashboard → Edge Functions → Secrets.",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({
        error: "Configuração do servidor incompleta",
        code: "SERVER_MISCONFIGURED",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const { messages, householdId, quickAction } = await req.json();

    if (!householdId || !UUID_REGEX.test(householdId)) {
      return new Response(JSON.stringify({ error: "householdId é obrigatório e deve ser válido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for forbidden requests
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    if (lastUserMessage && containsForbiddenRequest(lastUserMessage.content)) {
      console.log(`[SECURITY] Blocked forbidden request from user ${user.id}`);
      const encoder = new TextEncoder();
      const forbiddenStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: FORBIDDEN_RESPONSE } }] })}\n\ndata: [DONE]\n\n`));
          controller.close();
        },
      });
      return new Response(forbiddenStream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // Validate household membership
    const isMember = await validateHouseholdMembership(supabase, user.id, householdId);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Você não tem permissão para acessar esta família." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const householdName = await getHouseholdName(supabase, householdId);
    const fullCategoryLabels = await getCategoryLabelsForHousehold(supabase, householdId);
    const requestId = crypto.randomUUID?.()?.slice(0, 8) || `req-${Date.now()}`;

    // Quick action: run tool directly and stream result (no AI placeholder)
    const QUICK_ACTION_MAP: Record<string, string> = {
      diagnostico_periodo_total: "analyze_spending",
      verificar_pendencias: "get_pending_items",
      listar_regras: "list_categorization_rules",
      ver_metas_mes: "check_goals_progress",
      maiores_gastos: "top_expenses",
      gasto_fora_padrao: "outlier_expenses",
      orcamento_restante: "budget_remaining",
      categorizar_sem_categoria: "categorize_uncategorized",
    };
    if (quickAction && QUICK_ACTION_MAP[quickAction]) {
      const actionType = QUICK_ACTION_MAP[quickAction];
      const startTime = Date.now();
      console.log(`[clara-chat][${requestId}] quickAction=${quickAction} actionType=${actionType} householdId=${householdId} userId=${user.id}`);
      const encoder = new TextEncoder();
      let result: { success: boolean; message: string } = { success: false, message: "Erro ao executar ação." };
      try {
        switch (actionType) {
          case "analyze_spending": {
            const analysis = await analyzeSpendingTrends(supabase, householdId, fullCategoryLabels);
            const insightsMsg = analysis.insights.join("\n");
            const subsMsg = analysis.recurringSubscriptions.length > 0
              ? `\n\n🔄 **Assinaturas Detectadas**:\n${analysis.recurringSubscriptions.map((s: any) => `- ${s.description}: ~R$ ${s.avgAmount.toFixed(2)}/mês`).join("\n")}`
              : "";
            result = { success: true, message: `\n\n📊 **Diagnóstico de Economia**:\n\n${insightsMsg}${subsMsg}\n` };
            break;
          }
          case "get_pending_items": {
            const pending = await getPendingItems(supabase, householdId);
            if (pending.items.length === 0) {
              result = { success: true, message: "✅ Nenhuma pendência! Tudo em ordem." };
            } else {
              const pendingMsg = pending.items.map((i: any) => `- ⚠️ ${i.message}`).join("\n");
              result = { success: true, message: `\n\n📋 **Pendências**:\n\n${pendingMsg}\n\nPosso ajudar a resolver alguma?` };
            }
            break;
          }
          case "list_categorization_rules": {
            const rulesResult = await listCategorizationRules(supabase, householdId);
            if (rulesResult.rules.length === 0) {
              result = { success: true, message: "📜 Nenhuma regra automática configurada. Quer criar uma?" };
            } else {
              const rulesList = rulesResult.rules.map((r: any) => `- "${r.pattern}" → ${fullCategoryLabels[r.category] || r.category} (aplicada ${r.times_applied}x)`).join("\n");
              result = { success: true, message: `\n\n📜 **Regras Automáticas**:\n\n${rulesList}\n` };
            }
            break;
          }
          case "check_goals_progress": {
            const goalsResult = await getCategoryBudgetProgress(supabase, householdId);
            if (goalsResult.budgets.length === 0) {
              result = { success: true, message: "📊 Nenhuma meta definida para este mês. Quer criar uma?" };
            } else {
              const goalsMsg = goalsResult.budgets.map((b: any) => {
                const icon = b.status === "exceeded" ? "🚨" : b.status === "warning" ? "⚠️" : "✅";
                return `${icon} **${fullCategoryLabels[b.category] || b.category}**: R$ ${b.spent.toFixed(2)} / R$ ${b.amount.toFixed(2)} (${b.percentage}%)`;
              }).join("\n");
              result = { success: true, message: `\n\n🎯 **Progresso das Metas**:\n\n${goalsMsg}\n` };
            }
            break;
          }
          case "top_expenses": {
            // Top 10 expenses of current month
            const now = new Date();
            const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
            const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
            const { data: topTxs } = await supabase.from("transactions")
              .select("description, amount, category, transaction_date")
              .eq("household_id", householdId)
              .gte("transaction_date", startOfMonth)
              .lte("transaction_date", endOfMonth)
              .lt("amount", 0)
              .order("amount", { ascending: true })
              .limit(10);
            if (!topTxs || topTxs.length === 0) {
              result = { success: true, message: "Nenhum gasto registrado este mês." };
            } else {
              const topList = topTxs.map((t: any, i: number) => `${i + 1}. **${t.description}** — R$ ${Math.abs(t.amount).toFixed(2)} (${fullCategoryLabels[t.category] || t.category})`).join("\n");
              result = { success: true, message: `\n\n💰 **Maiores Gastos do Mês**:\n\n${topList}\n` };
            }
            break;
          }
          case "outlier_expenses": {
            // Find expenses significantly above average for their category
            const now2 = new Date();
            const som = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-01`;
            const eom = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-${new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate()}`;
            const { data: monthTxs } = await supabase.from("transactions")
              .select("description, amount, category")
              .eq("household_id", householdId)
              .gte("transaction_date", som)
              .lte("transaction_date", eom)
              .lt("amount", 0);
            if (!monthTxs || monthTxs.length < 3) {
              result = { success: true, message: "Poucos gastos para detectar outliers." };
            } else {
              const catAvg: Record<string, { total: number; count: number }> = {};
              for (const t of monthTxs) {
                if (!catAvg[t.category]) catAvg[t.category] = { total: 0, count: 0 };
                catAvg[t.category].total += Math.abs(t.amount);
                catAvg[t.category].count++;
              }
              const outliers = monthTxs.filter((t: any) => {
                const avg = catAvg[t.category].total / catAvg[t.category].count;
                return Math.abs(t.amount) > avg * 2.5 && Math.abs(t.amount) > 50;
              });
              if (outliers.length === 0) {
                result = { success: true, message: "✅ Nenhum gasto fora do padrão detectado!" };
              } else {
                const outList = outliers.map((t: any) => `- ⚠️ **${t.description}**: R$ ${Math.abs(t.amount).toFixed(2)} (${fullCategoryLabels[t.category] || t.category})`).join("\n");
                result = { success: true, message: `\n\n🔍 **Gastos Fora do Padrão**:\n\n${outList}\n` };
              }
            }
            break;
          }
          case "categorize_uncategorized": {
            const householdNameForCat = await getHouseholdName(supabase, householdId);
            const { transactions: uncatList, suggestions: suggestList, error: catErr } = await listUncategorizedAndSuggest(supabase, householdId, authHeader, { limit: 50 });
            if (catErr) {
              result = { success: false, message: `Erro ao buscar sugestões: ${catErr}. Tente novamente.` };
            } else if (uncatList.length === 0) {
              result = { success: true, message: "✅ Nenhum gasto sem categoria nos últimos 30 dias. Tudo em ordem!" };
            } else {
              const previewPayload = JSON.stringify({
                householdId,
                householdName: householdNameForCat,
                suggestions: suggestList,
              });
              result = {
                success: true,
                message: `\n\n🏷️ **Categorizar gastos sem categoria**\n\nEncontrei **${uncatList.length}** gasto(s) sem categoria. Revise as sugestões abaixo e confirme para aplicar.\n\n<!-- CATEGORIZE_PREVIEW:${previewPayload} -->`,
              };
            }
            break;
          }
          case "budget_remaining": {
            // Check budget vs spending
            const { data: budgetData } = await supabase.from("budgets")
              .select("amount")
              .eq("household_id", householdId)
              .eq("period_type", "monthly")
              .order("start_date", { ascending: false })
              .limit(1);
            const now3 = new Date();
            const som3 = `${now3.getFullYear()}-${String(now3.getMonth() + 1).padStart(2, "0")}-01`;
            const eom3 = `${now3.getFullYear()}-${String(now3.getMonth() + 1).padStart(2, "0")}-${new Date(now3.getFullYear(), now3.getMonth() + 1, 0).getDate()}`;
            const { data: expTxs } = await supabase.from("transactions")
              .select("amount")
              .eq("household_id", householdId)
              .gte("transaction_date", som3)
              .lte("transaction_date", eom3)
              .lt("amount", 0);
            const totalSpent = (expTxs || []).reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
            if (!budgetData || budgetData.length === 0) {
              result = { success: true, message: `💰 Sem orçamento definido. Gastos do mês: R$ ${totalSpent.toFixed(2)}` };
            } else {
              const budget = budgetData[0].amount;
              const remaining = budget - totalSpent;
              const pct = Math.round((totalSpent / budget) * 100);
              const daysLeft = new Date(now3.getFullYear(), now3.getMonth() + 1, 0).getDate() - now3.getDate();
              const perDay = daysLeft > 0 ? remaining / daysLeft : 0;
              const icon = remaining >= 0 ? "✅" : "🚨";
              result = {
                success: true,
                message: `\n\n💳 **Orçamento do Mês**:\n\n${icon} R$ ${totalSpent.toFixed(2)} / R$ ${budget.toFixed(2)} (${pct}%)\n\nRestante: R$ ${remaining.toFixed(2)}\n${daysLeft > 0 ? `Pode gastar ~R$ ${perDay.toFixed(2)}/dia nos próximos ${daysLeft} dias.` : ""}\n`
              };
            }
            break;
          }
          default:
            result = { success: false, message: "Ação rápida não reconhecida." };
        }
      } catch (err) {
        console.error(`[clara-chat][${requestId}] quickAction error:`, err);
        result = { success: false, message: `Erro ao executar: ${err instanceof Error ? err.message : "erro desconhecido"}. Tente novamente.` };
      }
      const duration = Date.now() - startTime;
      console.log(`[clara-chat][${requestId}] quickAction done in ${duration}ms`);
      const icon = result.success ? "✅" : "❌";
      const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n${icon} ${result.message}` } }] })}\n\ndata: [DONE]\n\n`;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(payload));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // Fetch financial data
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

    const { data: accounts } = await supabase.from("accounts").select("*").eq("household_id", householdId).eq("is_active", true);
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).single();
    const { data: categoryBudgets } = await supabase.from("category_budgets").select("*").eq("household_id", householdId).eq("month", currentMonth).eq("year", currentYear);
    const { data: categorizationRules } = await supabase.from("categorization_rules").select("*").eq("household_id", householdId).eq("is_active", true).limit(10);

    const transactions = currentMonthTxs || [];
    const lastMonthTransactions = lastMonthTxs || [];

    const totalExpenses = transactions.filter((t: any) => t.amount < 0).reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
    const lastMonthExpenses = lastMonthTransactions.filter((t: any) => t.amount < 0).reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

    const byCategory: Record<string, number> = {};
    transactions.filter((t: any) => t.amount < 0).forEach((t: any) => {
      byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(t.amount);
    });

    const totalBalance = (accounts || []).reduce((sum: number, acc: any) => sum + acc.balance, 0);
    const currentMonthName = monthNames[currentMonth];

    const categoryBreakdown = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `- ${fullCategoryLabels[cat] || cat}: R$ ${amount.toFixed(2)}`)
      .join("\n");

    const recentTransactions = transactions.slice(0, 15)
      .map((t: any) => `- ID: ${t.id} | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${fullCategoryLabels[t.category] || t.category}) - ${t.transaction_date}`)
      .join("\n");

    const budgetProgress = (categoryBudgets || []).map((b: any) => {
      const spent = byCategory[b.category] || 0;
      const pct = Math.round((spent / b.amount) * 100);
      return `- ${fullCategoryLabels[b.category] || b.category}: R$ ${spent.toFixed(2)} / R$ ${b.amount.toFixed(2)} (${pct}%)`;
    }).join("\n");

    const rulesInfo = (categorizationRules || []).map((r: any) => `- "${r.pattern}" → ${fullCategoryLabels[r.category] || r.category}`).join("\n");

    const uncategorizedCount = transactions.filter((t: any) => t.category === "other").length;

    const systemPrompt = `Você é o Odin, um assistente financeiro pessoal inteligente e PROATIVO do CasaCampos.

🚫 OPERAÇÕES PROIBIDAS (NUNCA EXECUTE):
- Excluir/remover famílias, casas ou usuários
- Bloquear/desbloquear usuários
- Alterar permissões ou roles
Se pedirem, recuse educadamente.

⚠️ REGRA CRÍTICA DE ISOLAMENTO:
- Você APENAS tem acesso aos dados da família "${householdName}" (ID: ${householdId})
- NUNCA mencione ou acesse dados de outras famílias

📋 INFORMAÇÕES DO USUÁRIO:
- Nome: ${profile?.display_name || "Usuário"}
- Família: ${householdName}

💰 DADOS FINANCEIROS DE ${currentMonthName.toUpperCase()}:
- Gastos: R$ ${totalExpenses.toFixed(2)}
- Transações: ${transactions.length}
${lastMonthExpenses > 0 ? `- Variação: ${((totalExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1)}% vs mês anterior` : ""}

📊 GASTOS POR CATEGORIA:
${categoryBreakdown || "Nenhum gasto registrado"}

🎯 METAS DO MÊS:
${budgetProgress || "Nenhuma meta definida"}

📜 REGRAS AUTOMÁTICAS:
${rulesInfo || "Nenhuma regra ativa"}

📂 CATEGORIAS VÁLIDAS (use o ID exato em create_categorization_rule e apply_category_now):
${Object.entries(fullCategoryLabels).map(([id, label]) => `- ${id}: ${label}`).join("\n")}

⚠️ PENDÊNCIAS:
${uncategorizedCount > 0 ? `- ${uncategorizedCount} lançamento(s) sem categoria` : "- Nenhuma pendência"}

📈 TRANSAÇÕES RECENTES:
${recentTransactions || "Nenhuma transação"}

🏦 SALDO TOTAL: R$ ${totalBalance.toFixed(2)}

🎯 SUAS FUNÇÕES DISPONÍVEIS:
1. **add_transaction**: Adicionar lançamento
2. **update_transaction**: Editar lançamento
3. **search_transactions**: Buscar lançamentos
4. **request_deletion_preview**: Preview de exclusão
5. **create_categorization_rule**: Criar regra automática
6. **apply_category_now**: Aplicar categoria em massa
7. **create_category_goal**: Criar meta por categoria
8. **check_goals_progress**: Ver progresso das metas
9. **analyze_spending**: Diagnóstico de economia
10. **get_pending_items**: Ver pendências
11. **list_categorization_rules**: Listar regras

🔥 SEJA PROATIVO! Sugira ações quando apropriado:
- Se houver lançamentos sem categoria: sugira usar a ação rápida "Categorizar sem categoria" para ver sugestões da IA e aplicar em lote (com confirmação).
- Se gastos aumentaram: "Quer que eu crie uma meta para controlar?"
- Se detectar padrões: "Notei gastos recorrentes com X, quer criar uma regra?"

📝 INSTRUÇÕES:
1. Seja amigável e use emojis
2. Use as FUNÇÕES para executar ações
3. Responda em português brasileiro
4. Valores de gastos são NEGATIVOS
5. Para exclusões, SEMPRE use preview primeiro
6. SUGIRA ações que podem ajudar o usuário`;

    // Use Manus AI provider for streaming
    const { generateStream } = await import("../_shared/manusProvider.ts");
    
    let response: Response;
    try {
      response = await generateStream({
        messages,
        systemInstruction: systemPrompt,
        temperature: 0.7,
      });
    } catch (streamError) {
      if (streamError instanceof Error && streamError.message.includes("RATE_LIMITED")) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Aguarde um momento." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (streamError instanceof Error && streamError.message.includes("INVALID_API_KEY")) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("Erro ao conectar com a IA");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullResponseText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Parse Manus SSE events (already in OpenAI-compatible format)
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const payload = line.slice(6).trim();
                if (!payload || payload === "[DONE]") continue;
                try {
                  const json = JSON.parse(payload);
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    fullResponseText += content;
                    // Already in OpenAI-compatible format
                    controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                  }
                } catch { /* ignore parse errors in stream */ }
              }
            }
          }

          // Try to extract tool calls from the full response text (Gemini text-based)
          // The model may output JSON blocks for function calls
          const toolCalls: any[] = [];
          const toolCallRegex = /\{"function_call":\s*\{"name":\s*"(\w+)",\s*"arguments":\s*(\{[^}]*\})\s*\}\s*\}/g;
          let match;
          while ((match = toolCallRegex.exec(fullResponseText)) !== null) {
            toolCalls.push({
              function: { name: match[1], arguments: match[2] },
            });
          }

          // Process tool calls
          for (const toolCall of toolCalls) {
            if (!toolCall?.function?.name) continue;
            let result: any;
            let args: any = {};

            try {
              args = JSON.parse(toolCall.function.arguments || "{}");
            } catch { continue; }

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
                const searchResult = await previewDeletion(supabase, householdId, args, fullCategoryLabels);
                if (searchResult.success && searchResult.count > 0) {
                  const limit = args.limit || 10;
                  const sampleList = searchResult.sample.slice(0, limit)
                    .map((t: any) => `- **${t.date}** | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)} (${t.category}) [ID: ${t.id}]`)
                    .join("\n");
                  const msg = `\n\n🔍 **Encontrei ${searchResult.count} lançamento(s)**:\n\n${sampleList}${searchResult.count > limit ? `\n\n_...e mais ${searchResult.count - limit}._` : ""}\n`;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: msg } }] })}\n\n`));
                } else {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n🔍 Nenhum lançamento encontrado.\n` } }] })}\n\n`));
                }
                continue;

              case "request_deletion_preview":
                const hasFilters = args.transactionIds || args.descriptionMatch || args.category || args.month !== undefined || args.year !== undefined;
                if (!hasFilters) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n⚠️ Especifique filtros para evitar apagar tudo!\n` } }] })}\n\n`));
                  continue;
                }
                const preview = await previewDeletion(supabase, householdId, args, fullCategoryLabels);
                if (preview.success && preview.count > 0) {
                  const samplePreview = preview.sample.slice(0, 5).map((t: any) => `- ${t.date} | ${t.description}: R$ ${Math.abs(t.amount).toFixed(2)}`).join("\n");
                  const previewMsg = `\n\n🔒 **Modo de Segurança**\n\n**${preview.count} lançamento(s)** (${preview.rangeLabel})\n💰 Total: R$ ${preview.sumAmount.toFixed(2)}\n\n${samplePreview}\n\n⚠️ Ação irreversível. Clique no botão abaixo para confirmar.\n\n<!-- DELETION_PREVIEW:${JSON.stringify({ count: preview.count, transactionIds: preview.transactionIds, sumAmount: preview.sumAmount, rangeLabel: preview.rangeLabel, topCategories: preview.topCategories, householdId, householdName })} -->`;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: previewMsg } }] })}\n\n`));
                } else {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n${preview.message}\n` } }] })}\n\n`));
                }
                continue;

              case "create_categorization_rule":
                result = await createCategorizationRule(supabase, user.id, householdId, args, fullCategoryLabels);
                break;

              case "apply_category_now":
                result = await applyCategoryToTransactions(supabase, householdId, args.pattern, args.category, fullCategoryLabels);
                break;

              case "create_category_goal":
                result = await createCategoryBudget(supabase, user.id, householdId, args, fullCategoryLabels);
                break;

              case "check_goals_progress":
                const goalsResult = await getCategoryBudgetProgress(supabase, householdId);
                if (goalsResult.budgets.length === 0) {
                  result = { success: true, message: "📊 Nenhuma meta definida para este mês. Quer criar uma?" };
                } else {
                  const goalsMsg = goalsResult.budgets.map((b: any) => {
                    const icon = b.status === "exceeded" ? "🚨" : b.status === "warning" ? "⚠️" : "✅";
                    return `${icon} **${fullCategoryLabels[b.category] || b.category}**: R$ ${b.spent.toFixed(2)} / R$ ${b.amount.toFixed(2)} (${b.percentage}%)`;
                  }).join("\n");
                  result = { success: true, message: `\n\n🎯 **Progresso das Metas**:\n\n${goalsMsg}\n` };
                }
                break;

              case "analyze_spending":
                const analysis = await analyzeSpendingTrends(supabase, householdId, fullCategoryLabels);
                const insightsMsg = analysis.insights.join("\n");
                const subsMsg = analysis.recurringSubscriptions.length > 0
                  ? `\n\n🔄 **Assinaturas Detectadas**:\n${analysis.recurringSubscriptions.map((s: any) => `- ${s.description}: ~R$ ${s.avgAmount.toFixed(2)}/mês`).join("\n")}`
                  : "";
                result = { success: true, message: `\n\n📊 **Diagnóstico de Economia**:\n\n${insightsMsg}${subsMsg}\n` };
                break;

              case "get_pending_items":
                const pending = await getPendingItems(supabase, householdId);
                if (pending.items.length === 0) {
                  result = { success: true, message: "✅ Nenhuma pendência! Tudo em ordem." };
                } else {
                  const pendingMsg = pending.items.map((i: any) => `- ⚠️ ${i.message}`).join("\n");
                  result = { success: true, message: `\n\n📋 **Pendências**:\n\n${pendingMsg}\n\nPosso ajudar a resolver alguma?` };
                }
                break;

              case "list_categorization_rules":
                const rulesResult = await listCategorizationRules(supabase, householdId);
                if (rulesResult.rules.length === 0) {
                  result = { success: true, message: "📜 Nenhuma regra automática configurada. Quer criar uma?" };
                } else {
                  const rulesList = rulesResult.rules.map((r: any) => `- "${r.pattern}" → ${fullCategoryLabels[r.category] || r.category} (aplicada ${r.times_applied}x)`).join("\n");
                  result = { success: true, message: `\n\n📜 **Regras Automáticas**:\n\n${rulesList}\n` };
                }
                break;

              default:
                result = { success: false, message: "Função não reconhecida" };
            }

            if (result) {
              const icon = result.success ? "✅" : "❌";
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n${icon} ${result.message}` } }] })}\n\n`));
            }
          }

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("clara-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
