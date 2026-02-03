import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface Transaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category: CategoryType;
  payment_method: "pix" | "boleto" | "card" | "cash";
  status: "paid" | "pending";
  is_recurring: boolean;
  transaction_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewTransaction {
  description: string;
  amount: number;
  category: CategoryType;
  payment_method: "pix" | "boleto" | "card" | "cash";
  status: "paid" | "pending";
  is_recurring: boolean;
  transaction_date?: string;
  notes?: string;
}

export async function getTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false });

  if (error) throw error;
  
  return (data || []).map(tx => ({
    ...tx,
    category: tx.category as CategoryType,
    payment_method: tx.payment_method as "pix" | "boleto" | "card" | "cash",
    status: tx.status as "paid" | "pending",
  }));
}

export async function addTransaction(transaction: NewTransaction): Promise<Transaction> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
      payment_method: transaction.payment_method,
      status: transaction.status,
      is_recurring: transaction.is_recurring,
      transaction_date: transaction.transaction_date || new Date().toISOString().split("T")[0],
      notes: transaction.notes,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    category: data.category as CategoryType,
    payment_method: data.payment_method as "pix" | "boleto" | "card" | "cash",
    status: data.status as "paid" | "pending",
  };
}

export async function updateTransaction(id: string, updates: Partial<NewTransaction>): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    category: data.category as CategoryType,
    payment_method: data.payment_method as "pix" | "boleto" | "card" | "cash",
    status: data.status as "paid" | "pending",
  };
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getMonthlyStats(month?: number, year?: number) {
  const now = new Date();
  const targetMonth = month ?? now.getMonth();
  const targetYear = year ?? now.getFullYear();

  const startDate = new Date(targetYear, targetMonth, 1).toISOString().split("T")[0];
  const endDate = new Date(targetYear, targetMonth + 1, 0).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate);

  if (error) throw error;

  const transactions = data || [];
  
  const totalExpenses = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalIncome = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const byCategory = transactions
    .filter(t => t.amount < 0)
    .reduce((acc, t) => {
      const cat = t.category as CategoryType;
      acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
      return acc;
    }, {} as Record<CategoryType, number>);

  return {
    totalExpenses,
    totalIncome,
    balance: totalIncome - totalExpenses,
    byCategory,
    transactionCount: transactions.length,
  };
}

export interface MonthlyExpense {
  month: string;
  income: number;
  expenses: number;
}

export async function getMonthlyEvolution(months: number = 5): Promise<MonthlyExpense[]> {
  const now = new Date();
  const result: MonthlyExpense[] = [];
  
  // Get data for the last N months
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const { data, error } = await supabase
    .from("transactions")
    .select("amount, transaction_date")
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

    const income = monthTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    result.push({
      month: monthNames[targetDate.getMonth()],
      income,
      expenses,
    });
  }

  return result;
}
