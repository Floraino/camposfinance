import { supabase } from "@/integrations/supabase/client";
import type { Transaction } from "@/services/transactionService";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface TimelineDay {
  date: string; // YYYY-MM-DD
  label: string; // "sexta-feira, 6 de fevereiro"
  total: number; // soma do dia (sempre <= 0, despesas)
  expense: number; // total despesas (absoluto)
  items: Transaction[];
}

export interface TimelineFilters {
  month?: string; // YYYY-MM (legacy, still supported)
  from?: string;  // YYYY-MM-DD (preferred when present)
  to?: string;    // YYYY-MM-DD (preferred when present)
  status?: "paid" | "pending";
  category?: string;
}

export interface TimelineResult {
  days: TimelineDay[];
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

  let startDate: string;
  let endDate: string;

  if (filters.from && filters.to) {
    // New: date range mode
    startDate = filters.from;
    endDate = filters.to;
  } else if (filters.month) {
    // Legacy: month mode (YYYY-MM)
    const [year, month] = filters.month.split("-").map(Number);
    startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
    endDate = new Date(year, month, 0).toISOString().split("T")[0];
  } else {
    // Fallback: current month
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  }

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

  let totalExpense = 0;

  const days: TimelineDay[] = sortedDates.map((dateStr) => {
    const items = dayMap.get(dateStr)!;
    let dayTotal = 0;
    let dayExpense = 0;

    for (const tx of items) {
      dayTotal += tx.amount;
      if (tx.amount < 0) {
        dayExpense += Math.abs(tx.amount);
        totalExpense += Math.abs(tx.amount);
      }
    }

    return {
      date: dateStr,
      label: formatDayLabel(dateStr),
      total: dayTotal,
      expense: dayExpense,
      items,
    };
  });

  return {
    days,
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
