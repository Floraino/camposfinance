import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface InstallmentGroup {
  id: string;
  household_id: string;
  credit_card_id: string | null;
  description: string;
  total_amount: number;
  installment_count: number;
  start_month: string; // YYYY-MM-01
  category: string;
  status: "active" | "cancelled" | "completed";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NewInstallmentPurchase {
  description: string;
  totalAmount: number;
  installmentCount: number;
  startMonth: string; // YYYY-MM
  category: CategoryType;
  creditCardId?: string;
  memberId?: string;
}

/**
 * Create an installment purchase:
 * 1. Creates the installment_group record.
 * 2. Generates N transactions (one per month), each marked with
 *    installment_group_id and installment_number.
 */
export async function createInstallmentPurchase(
  householdId: string,
  purchase: NewInstallmentPurchase
): Promise<InstallmentGroup> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Não autenticado");

  const perInstallment = Math.round((purchase.totalAmount / purchase.installmentCount) * 100) / 100;

  // 1. Create the group
  const { data: group, error: groupError } = await supabase
    .from("installment_groups")
    .insert({
      household_id: householdId,
      credit_card_id: purchase.creditCardId || null,
      description: purchase.description,
      total_amount: purchase.totalAmount,
      installment_count: purchase.installmentCount,
      start_month: `${purchase.startMonth}-01`,
      category: purchase.category,
      status: "active",
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (groupError) throw groupError;

  // 2. Generate individual transactions
  const [startYear, startM] = purchase.startMonth.split("-").map(Number);
  const transactions = [];

  for (let i = 0; i < purchase.installmentCount; i++) {
    const txDate = new Date(startYear, startM - 1 + i, 15); // mid-month
    const txDateStr = txDate.toISOString().split("T")[0];
    const isFirstMonth = i === 0;
    const isFuture = txDate > new Date();

    transactions.push({
      user_id: userData.user.id,
      household_id: householdId,
      description: `${purchase.description} (${i + 1}/${purchase.installmentCount})`,
      amount: -Math.abs(perInstallment),
      category: purchase.category,
      payment_method: purchase.creditCardId ? "card" : "boleto",
      status: isFuture ? "pending" : (isFirstMonth ? "paid" : "pending"),
      is_recurring: false,
      transaction_date: txDateStr,
      credit_card_id: purchase.creditCardId || null,
      installment_group_id: group.id,
      installment_number: i + 1,
      member_id: purchase.memberId || null,
    });
  }

  const { error: txError } = await supabase
    .from("transactions")
    .insert(transactions);

  if (txError) throw txError;

  return group as InstallmentGroup;
}

/**
 * Get all active installment groups for a household.
 */
export async function getInstallmentGroups(householdId: string): Promise<InstallmentGroup[]> {
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("installment_groups")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as InstallmentGroup[];
}

/**
 * Cancel an installment group — deletes future unpaid transactions.
 */
export async function cancelInstallment(
  householdId: string,
  groupId: string
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  // Delete future pending transactions
  const { data: deleted, error: delError } = await supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId)
    .eq("installment_group_id", groupId)
    .eq("status", "pending")
    .gt("transaction_date", today)
    .select("id");

  if (delError) throw delError;

  // Update group status
  const { error: updError } = await supabase
    .from("installment_groups")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("household_id", householdId);

  if (updError) throw updError;

  return deleted?.length || 0;
}

/**
 * Get installment transactions for a group.
 */
export async function getInstallmentTransactions(
  householdId: string,
  groupId: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("installment_group_id", groupId)
    .order("installment_number", { ascending: true });

  if (error) throw error;
  return data || [];
}
