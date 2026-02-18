import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";
import { sanitizeTransactionForInsert } from "./transactionSanitizer";

export interface Transaction {
  id: string;
  user_id: string;
  household_id: string;
  description: string;
  amount: number;
  /** Categoria fixa ou custom (custom:<uuid>) */
  category: string;
  status: "paid" | "pending";
  is_recurring: boolean;
  transaction_date: string;
  due_date?: string | null; // v2: vencimento para boletos/contas
  account_id?: string | null; // v5: conta/banco
  credit_card_id?: string | null; // v3: cartão de crédito
  installment_group_id?: string | null; // v4: parcelamento
  installment_number?: number | null; // v4: nº da parcela (1, 2, 3...)
  notes: string | null;
  member_id: string | null;
  member_name?: string;
  created_at: string;
  updated_at: string;
}

/** Categoria: fixa (bills, food, ...) ou custom (custom:<uuid>) */
export type CategoryValue = CategoryType | string;

export interface NewTransaction {
  description: string;
  amount: number;
  category: CategoryValue;
  status: "paid" | "pending";
  is_recurring: boolean;
  transaction_date?: string;
  due_date?: string | null; // v2: vencimento para boletos/contas
  notes?: string;
  member_id?: string;
  account_id?: string | null; // v5: conta/banco
  credit_card_id?: string | null; // v3: cartão de crédito
}

// CRITICAL: All queries MUST filter by householdId for data isolation
export async function getTransactions(householdId: string): Promise<Transaction[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para listar transações");
  }

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      *,
      family_members (
        name
      )
    `)
    .eq("household_id", householdId)
    .order("transaction_date", { ascending: false });

  if (error) throw error;
  
  return (data || []).map(tx => ({
    ...tx,
    category: tx.category as string,
    status: tx.status as "paid" | "pending",
    member_name: (tx.family_members as { name: string } | null)?.name,
  }));
}

export async function addTransaction(householdId: string, transaction: NewTransaction): Promise<Transaction> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para criar transação");
  }

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Usuário não autenticado");

  const insertData = {
    user_id: user.id,
    household_id: householdId,
    description: transaction.description,
    amount: transaction.amount,
    category: transaction.category,
    status: transaction.status,
    is_recurring: transaction.is_recurring,
    transaction_date: transaction.transaction_date || new Date().toISOString().split("T")[0],
    due_date: transaction.due_date || null,
    notes: transaction.notes,
    member_id: transaction.member_id,
    account_id: transaction.account_id || null,
    credit_card_id: transaction.credit_card_id || null,
  };
  
  // Sanitize to ensure no extra fields (e.g., payment_method) are included
  const sanitizedData = sanitizeTransactionForInsert(insertData);
  
  const { data, error } = await supabase
    .from("transactions")
    .insert(sanitizedData)
    .select(`
      *,
      family_members (
        name
      )
    `)
    .single();

  if (error) throw error;

  return {
    ...data,
    category: data.category as string,
    status: data.status as "paid" | "pending",
    member_name: (data.family_members as { name: string } | null)?.name,
  };
}

export async function updateTransaction(id: string, householdId: string, updates: Partial<NewTransaction>): Promise<Transaction> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para atualizar transação");
  }

  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("household_id", householdId) // Double-check ownership
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    category: data.category as string,
    status: data.status as "paid" | "pending",
  };
}

export async function deleteTransaction(id: string, householdId: string): Promise<void> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para deletar transação");
  }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId); // Double-check ownership

  if (error) throw error;
}

// Bulk delete — deletes multiple transactions at once.
// Each transaction must belong to the given household (RLS + explicit filter).
export async function deleteTransactionsBulk(ids: string[], householdId: string): Promise<number> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para deletar transações");
  }
  if (!ids.length) {
    throw new Error("Nenhuma transação selecionada");
  }

  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .in("id", ids)
    .eq("household_id", householdId)
    .select("id"); // returns deleted rows so we can count

  if (error) throw error;
  return data?.length ?? 0;
}

/** Bulk update category for multiple transactions. Modo Seguro: só aplica após confirmação do usuário. */
export async function updateTransactionsCategory(
  householdId: string,
  updates: Array<{ id: string; category: CategoryType }>
): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }
  if (!updates.length) {
    return { updated: 0, failed: [] };
  }
  const failed: Array<{ id: string; reason: string }> = [];
  let updated = 0;
  for (const { id, category } of updates) {
    try {
      await updateTransaction(id, householdId, { category });
      updated++;
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  }
  return { updated, failed };
}

export async function getMonthlyStats(
  householdId: string,
  monthOrFrom?: number | string,
  yearOrTo?: number | string,
) {
  if (!householdId) {
    throw new Error("householdId é obrigatório para estatísticas");
  }

  let startDate: string;
  let endDate: string;

  // Detect if called with date range strings (from/to) or legacy month/year numbers
  if (typeof monthOrFrom === "string" && typeof yearOrTo === "string") {
    // New: date range mode → from/to as YYYY-MM-DD
    startDate = monthOrFrom;
    endDate = yearOrTo;
  } else {
    // Legacy: month (0-11) / year mode
    const now = new Date();
    const targetMonth = (typeof monthOrFrom === "number" ? monthOrFrom : now.getMonth());
    const targetYear = (typeof yearOrTo === "number" ? yearOrTo : now.getFullYear());
    startDate = new Date(targetYear, targetMonth, 1).toISOString().split("T")[0];
    endDate = new Date(targetYear, targetMonth + 1, 0).toISOString().split("T")[0];
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate);

  if (error) throw error;

  const transactions = data || [];
  
  // App controla apenas despesas: amount armazenado negativo; consideramos apenas valores negativos
  const totalExpenses = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const byCategory = transactions
    .filter(t => t.amount < 0)
    .reduce((acc, t) => {
      const cat = t.category ?? "other";
      acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
      return acc;
    }, {} as Record<string, number>);

  return {
    totalExpenses,
    byCategory,
    transactionCount: transactions.length,
  };
}

export interface MonthlyExpense {
  month: string;
  expenses: number;
}

export async function getMonthlyEvolution(householdId: string, months: number = 5): Promise<MonthlyExpense[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para evolução mensal");
  }

  const now = new Date();
  const result: MonthlyExpense[] = [];
  
  // Get data for the last N months
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const { data, error } = await supabase
    .from("transactions")
    .select("amount, transaction_date")
    .eq("household_id", householdId)
    .gte("transaction_date", startDate.toISOString().split("T")[0])
    .lte("transaction_date", endDate.toISOString().split("T")[0]);

  if (error) throw error;

  const transactions = data || [];

  // Group by month
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  
  for (let i = 0; i < months; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

    const monthTransactions = transactions.filter(t => {
      const txDate = new Date(t.transaction_date);
      return txDate >= monthStart && txDate <= monthEnd;
    });

    const expenses = monthTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    result.push({
      month: monthNames[targetDate.getMonth()],
      expenses,
    });
  }

  return result;
}
