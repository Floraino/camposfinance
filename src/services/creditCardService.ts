import { supabase } from "@/integrations/supabase/client";

export interface CreditCard {
  id: string;
  household_id: string;
  name: string;
  last_four: string | null;
  card_brand: string;
  credit_limit: number;
  closing_day: number;
  due_day: number;
  color: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NewCreditCard {
  name: string;
  last_four?: string;
  card_brand?: string;
  credit_limit?: number;
  closing_day: number;
  due_day: number;
  color?: string;
}

export interface CardStatement {
  month: string; // YYYY-MM
  closingDate: string;
  dueDate: string;
  totalAmount: number;
  transactionCount: number;
  isClosed: boolean; // true if today > closing date of this cycle
  isPaid: boolean; // all transactions in this statement are "paid"
}

/**
 * Get all credit cards for a household.
 */
export async function getCreditCards(householdId: string): Promise<CreditCard[]> {
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("credit_cards")
    .select("*")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[creditCard] fetch error:", error);
    throw error;
  }

  return (data || []) as CreditCard[];
}

/**
 * Create a credit card.
 */
export async function createCreditCard(
  householdId: string,
  card: NewCreditCard
): Promise<CreditCard> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("credit_cards")
    .insert({
      household_id: householdId,
      name: card.name,
      last_four: card.last_four || null,
      card_brand: card.card_brand || "other",
      credit_limit: card.credit_limit || 0,
      closing_day: card.closing_day,
      due_day: card.due_day,
      color: card.color || "#6366F1",
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as CreditCard;
}

/**
 * Update a credit card.
 */
export async function updateCreditCard(
  id: string,
  householdId: string,
  updates: Partial<NewCreditCard>
): Promise<void> {
  const { error } = await supabase
    .from("credit_cards")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw error;
}

/**
 * Soft-delete a credit card.
 */
export async function deleteCreditCard(id: string, householdId: string): Promise<void> {
  const { error } = await supabase
    .from("credit_cards")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw error;
}

/**
 * Get the statement summary for a card in a given month.
 * A "statement" is computed: transactions with credit_card_id in the billing cycle.
 */
export async function getCardStatement(
  householdId: string,
  cardId: string,
  card: CreditCard,
  month: string // YYYY-MM
): Promise<CardStatement> {
  const [year, m] = month.split("-").map(Number);

  // Billing cycle: from closing_day of previous month to closing_day of this month
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? year - 1 : year;
  const startDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(card.closing_day).padStart(2, "0")}`;
  const endDate = `${year}-${String(m).padStart(2, "0")}-${String(card.closing_day).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("transactions")
    .select("amount, status")
    .eq("household_id", householdId)
    .eq("credit_card_id", cardId)
    .gt("transaction_date", startDate)
    .lte("transaction_date", endDate);

  if (error) {
    console.error("[creditCard] statement error:", error);
    throw error;
  }

  const txs = data || [];
  const totalAmount = txs.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);
  const allPaid = txs.every((tx: any) => tx.status === "paid");

  // Is the statement closed? Today > closing date of this cycle
  const today = new Date();
  const closingDate = new Date(year, m - 1, card.closing_day);
  const dueDate = new Date(year, m - 1, card.due_day);

  // If due_day < closing_day, due is next month
  if (card.due_day <= card.closing_day) {
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  return {
    month,
    closingDate: closingDate.toISOString().split("T")[0],
    dueDate: dueDate.toISOString().split("T")[0],
    totalAmount,
    transactionCount: txs.length,
    isClosed: today > closingDate,
    isPaid: allPaid && txs.length > 0,
  };
}

/**
 * Get transactions for a specific card statement (billing cycle).
 */
export async function getCardStatementTransactions(
  householdId: string,
  cardId: string,
  card: CreditCard,
  month: string
): Promise<any[]> {
  const [year, m] = month.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? year - 1 : year;
  const startDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(card.closing_day).padStart(2, "0")}`;
  const endDate = `${year}-${String(m).padStart(2, "0")}-${String(card.closing_day).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("credit_card_id", cardId)
    .gt("transaction_date", startDate)
    .lte("transaction_date", endDate)
    .order("transaction_date", { ascending: false });

  if (error) throw error;
  return data || [];
}
