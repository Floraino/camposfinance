import { supabase } from "@/integrations/supabase/client";
import type { Transaction } from "@/services/transactionService";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface TimelineDay {
  date: string; // YYYY-MM-DD
  label: string; // "sexta-feira, 6 de fevereiro"
  total: number; // soma do dia
  income: number; // total positivo
  expense: number; // total negativo (absoluto)
  items: Transaction[];
}

export interface TimelineFilters {
  month: string; // YYYY-MM
  paymentMethod?: "pix" | "boleto" | "card" | "cash";
  status?: "paid" | "pending";
  category?: string;
}

export interface TimelineResult {
  days: TimelineDay[];
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
}

/**
 * Fetches transactions for a given month, grouped by day.
 * Family-scoped — requires householdId.
 */
export async function getTimeline(
  householdId: string,
  filters: TimelineFilters
): Promise<TimelineResult> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const [year, month] = filters.month.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  let query = supabase
    .from("transactions")
    .select(`
      *,
      family_members (
        name
      )
    `)
    .eq("household_id", householdId)
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate)
    .order("transaction_date", { ascending: false });

  // Apply optional filters
  if (filters.paymentMethod) {
    query = query.eq("payment_method", filters.paymentMethod);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[timeline] Error fetching:", error);
    throw error;
  }

  const transactions: Transaction[] = (data || []).map((tx: any) => ({
    ...tx,
    category: tx.category as CategoryType,
    payment_method: tx.payment_method as Transaction["payment_method"],
    status: tx.status as Transaction["status"],
    member_name: tx.family_members?.name || undefined,
  }));

  // Group by day
  const dayMap = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const key = tx.transaction_date;
    if (!dayMap.has(key)) {
      dayMap.set(key, []);
    }
    dayMap.get(key)!.push(tx);
  }

  // Build sorted days array
  const sortedDates = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));

  let totalIncome = 0;
  let totalExpense = 0;

  const days: TimelineDay[] = sortedDates.map((dateStr) => {
    const items = dayMap.get(dateStr)!;
    let dayTotal = 0;
    let dayIncome = 0;
    let dayExpense = 0;

    for (const tx of items) {
      dayTotal += tx.amount;
      if (tx.amount > 0) {
        dayIncome += tx.amount;
        totalIncome += tx.amount;
      } else {
        dayExpense += Math.abs(tx.amount);
        totalExpense += Math.abs(tx.amount);
      }
    }

    return {
      date: dateStr,
      label: formatDayLabel(dateStr),
      total: dayTotal,
      income: dayIncome,
      expense: dayExpense,
      items,
    };
  });

  return {
    days,
    totalIncome,
    totalExpense,
    transactionCount: transactions.length,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("pt-BR", { month: "long" });
  return `${weekday}, ${day} de ${month}`;
}
