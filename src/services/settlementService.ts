import { supabase } from "@/integrations/supabase/client";

export interface MemberBalance {
  userId: string;
  userName: string;
  totalPaid: number; // quanto pagou em gastos compartilhados
  fairShare: number; // quanto deveria ter pago
  balance: number; // positivo = credor, negativo = devedor
}

export interface DebtEntry {
  debtorUserId: string;
  debtorName: string;
  creditorUserId: string;
  creditorName: string;
  amount: number;
}

export interface Settlement {
  id: string;
  household_id: string;
  debtor_user_id: string;
  creditor_user_id: string;
  amount: number;
  month: string;
  description: string | null;
  status: "pending" | "settled";
  settled_at: string | null;
  settled_by: string | null;
  created_at: string;
  // joined
  debtor_name?: string;
  creditor_name?: string;
}

export interface SettlementSummary {
  month: string;
  balances: MemberBalance[];
  debts: DebtEntry[];
  settlements: Settlement[];
  totalUnsettled: number;
}

/**
 * Calculate who owes what for a given month.
 * Logic: look at all transactions in the month with member_id set.
 * Each member's spending is tracked. The "fair share" is total / N members.
 * Anyone who spent more than fair share is a creditor; less = debtor.
 */
export async function calculateSettlement(
  householdId: string,
  month: string // YYYY-MM
): Promise<SettlementSummary> {
  if (!householdId) throw new Error("householdId obrigatório");

  const [year, m] = month.split("-").map(Number);
  const startDate = new Date(year, m - 1, 1).toISOString().split("T")[0];
  const endDate = new Date(year, m, 0).toISOString().split("T")[0];

  // Get household members with names
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, role, profiles:user_id(full_name, email)")
    .eq("household_id", householdId);

  const memberMap = new Map<string, string>();
  for (const m of members || []) {
    const profile = m.profiles as any;
    const name = profile?.full_name || profile?.email || m.user_id?.slice(0, 8) || "Membro";
    memberMap.set(m.user_id, name);
  }

  // Get transactions for the month (expenses only)
  const { data: txs } = await supabase
    .from("transactions")
    .select("amount, user_id, member_id")
    .eq("household_id", householdId)
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate)
    .lt("amount", 0);

  // Calculate how much each user paid
  const paidByUser = new Map<string, number>();
  let totalSpent = 0;

  for (const tx of txs || []) {
    const payerId = tx.user_id; // user who registered = who paid
    const absAmount = Math.abs(tx.amount);
    paidByUser.set(payerId, (paidByUser.get(payerId) || 0) + absAmount);
    totalSpent += absAmount;
  }

  const memberCount = memberMap.size || 1;
  const fairShare = totalSpent / memberCount;

  // Build balances
  const balances: MemberBalance[] = [];
  for (const [userId, name] of memberMap) {
    const totalPaid = paidByUser.get(userId) || 0;
    balances.push({
      userId,
      userName: name,
      totalPaid,
      fairShare,
      balance: totalPaid - fairShare, // positive = overpaid (creditor)
    });
  }

  // Sort: creditors first, then debtors
  balances.sort((a, b) => b.balance - a.balance);

  // Calculate optimal debts (minimize transfers)
  const debts = minimizeDebts(balances, memberMap);

  // Get existing settlements for this month
  const { data: settlements } = await supabase
    .from("settlements")
    .select("*")
    .eq("household_id", householdId)
    .eq("month", month)
    .order("created_at", { ascending: false });

  // Add names to settlements
  const settlementsWithNames: Settlement[] = (settlements || []).map((s: any) => ({
    ...s,
    debtor_name: memberMap.get(s.debtor_user_id) || "?",
    creditor_name: memberMap.get(s.creditor_user_id) || "?",
  }));

  const totalUnsettled = settlementsWithNames
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + s.amount, 0);

  return {
    month,
    balances,
    debts,
    settlements: settlementsWithNames,
    totalUnsettled,
  };
}

/**
 * Create settlement entries from calculated debts.
 */
export async function createSettlements(
  householdId: string,
  month: string,
  debts: DebtEntry[]
): Promise<number> {
  if (debts.length === 0) return 0;

  const rows = debts.map((d) => ({
    household_id: householdId,
    debtor_user_id: d.debtorUserId,
    creditor_user_id: d.creditorUserId,
    amount: Math.round(d.amount * 100) / 100,
    month,
    description: `Acerto ${month}: ${d.debtorName} → ${d.creditorName}`,
    status: "pending",
  }));

  const { error } = await supabase.from("settlements").insert(rows);
  if (error) throw error;
  return rows.length;
}

/**
 * Mark a settlement as settled.
 */
export async function markSettled(
  settlementId: string,
  householdId: string
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("settlements")
    .update({
      status: "settled",
      settled_at: new Date().toISOString(),
      settled_by: userData.user?.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlementId)
    .eq("household_id", householdId);

  if (error) throw error;
}

// ── Helpers ────────────────────────────────────────────────────────────

function minimizeDebts(
  balances: MemberBalance[],
  memberMap: Map<string, string>
): DebtEntry[] {
  const debts: DebtEntry[] = [];

  // Clone and work with copies
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }));
  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }));

  // Greedy: match largest debtor with largest creditor
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const transfer = Math.min(creditors[ci].balance, debtors[di].balance);
    if (transfer > 0.01) {
      debts.push({
        debtorUserId: debtors[di].userId,
        debtorName: memberMap.get(debtors[di].userId) || "?",
        creditorUserId: creditors[ci].userId,
        creditorName: memberMap.get(creditors[ci].userId) || "?",
        amount: Math.round(transfer * 100) / 100,
      });
    }
    creditors[ci].balance -= transfer;
    debtors[di].balance -= transfer;
    if (creditors[ci].balance < 0.01) ci++;
    if (debtors[di].balance < 0.01) di++;
  }

  return debts;
}
