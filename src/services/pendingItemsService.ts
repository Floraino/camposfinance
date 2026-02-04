import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";
import type { Transaction } from "@/services/transactionService";

export interface PendingItem {
  id: string;
  type: "uncategorized" | "duplicate" | "no_account" | "pending_split" | "pro_expiring";
  title: string;
  description: string;
  severity: "info" | "warning" | "error";
  data?: Record<string, unknown>;
  actions?: PendingAction[];
}

export interface PendingAction {
  label: string;
  action: string;
  variant?: "default" | "destructive";
}

export interface PendingSummary {
  total: number;
  byType: Record<string, number>;
  items: PendingItem[];
}

// Get transactions without proper categorization
export async function getUncategorizedTransactions(householdId: string): Promise<Transaction[]> {
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("category", "other")
    .order("transaction_date", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching uncategorized:", error);
    return [];
  }

  return (data || []).map(tx => ({
    ...tx,
    category: tx.category as CategoryType,
    payment_method: tx.payment_method as "pix" | "boleto" | "card" | "cash",
    status: tx.status as "paid" | "pending",
  }));
}

// Detect duplicate transactions (same date, amount, description)
export async function getDuplicateTransactions(householdId: string): Promise<Transaction[][]> {
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .order("transaction_date", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Error fetching for duplicates:", error);
    return [];
  }

  const transactions = data || [];
  const duplicateGroups: Transaction[][] = [];
  const seen = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    // Create a hash of date + amount + description (normalized)
    const hash = `${tx.transaction_date}|${tx.amount}|${tx.description.toLowerCase().trim()}`;
    
    if (seen.has(hash)) {
      seen.get(hash)!.push(tx as Transaction);
    } else {
      seen.set(hash, [tx as Transaction]);
    }
  }

  // Only return groups with more than 1 item
  for (const group of seen.values()) {
    if (group.length > 1) {
      duplicateGroups.push(group.map(tx => ({
        ...tx,
        category: tx.category as CategoryType,
        payment_method: tx.payment_method as "pix" | "boleto" | "card" | "cash",
        status: tx.status as "paid" | "pending",
      })));
    }
  }

  return duplicateGroups;
}

// Get pending splits (participants who haven't paid)
export async function getPendingSplitPayments(householdId: string): Promise<PendingItem[]> {
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("split_events")
    .select(`
      *,
      split_participants (
        *,
        households:participant_household_id (name)
      )
    `)
    .eq("owner_household_id", householdId)
    .eq("status", "ACTIVE");

  if (error) {
    console.error("Error fetching pending splits:", error);
    return [];
  }

  const pendingItems: PendingItem[] = [];

  for (const event of data || []) {
    const unpaidParticipants = (event.split_participants || []).filter(
      (p: { payment_status: string }) => p.payment_status !== "PAID"
    );

    if (unpaidParticipants.length > 0) {
      pendingItems.push({
        id: `split-${event.id}`,
        type: "pending_split",
        title: `Rateio: ${event.title}`,
        description: `${unpaidParticipants.length} participante(s) pendente(s)`,
        severity: "warning",
        data: { eventId: event.id, unpaidCount: unpaidParticipants.length },
        actions: [
          { label: "Ver detalhes", action: `view_split:${event.id}` },
          { label: "Cobrar", action: `remind_split:${event.id}` },
        ],
      });
    }
  }

  return pendingItems;
}

// Check if PRO is expiring soon (within 7 days)
export async function getProExpirationWarning(householdId: string): Promise<PendingItem | null> {
  if (!householdId) return null;

  const { data, error } = await supabase
    .from("household_plans")
    .select("plan, pro_expires_at")
    .eq("household_id", householdId)
    .single();

  if (error || !data) return null;

  if (data.plan === "PRO" && data.pro_expires_at) {
    const expiresAt = new Date(data.pro_expires_at);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
      return {
        id: "pro-expiring",
        type: "pro_expiring",
        title: "PRO expirando em breve",
        description: `Seu plano PRO expira em ${daysUntilExpiry} dia(s)`,
        severity: "warning",
        data: { daysUntilExpiry, expiresAt: data.pro_expires_at },
        actions: [
          { label: "Renovar", action: "renew_pro" },
        ],
      };
    }
  }

  return null;
}

// Get all pending items for the household
export async function getAllPendingItems(householdId: string): Promise<PendingSummary> {
  if (!householdId) {
    return { total: 0, byType: {}, items: [] };
  }

  const [uncategorized, duplicates, pendingSplits, proWarning] = await Promise.all([
    getUncategorizedTransactions(householdId),
    getDuplicateTransactions(householdId),
    getPendingSplitPayments(householdId),
    getProExpirationWarning(householdId),
  ]);

  const items: PendingItem[] = [];
  const byType: Record<string, number> = {};

  // Uncategorized transactions
  if (uncategorized.length > 0) {
    items.push({
      id: "uncategorized-summary",
      type: "uncategorized",
      title: `${uncategorized.length} transação(ões) sem categoria`,
      description: "Categorize para melhor organização",
      severity: "info",
      data: { transactions: uncategorized.slice(0, 5), total: uncategorized.length },
      actions: [
        { label: "Categorizar agora", action: "categorize_all" },
        { label: "Ver todas", action: "view_uncategorized" },
      ],
    });
    byType.uncategorized = uncategorized.length;
  }

  // Duplicates
  if (duplicates.length > 0) {
    const totalDuplicates = duplicates.reduce((sum, group) => sum + group.length - 1, 0);
    items.push({
      id: "duplicates-summary",
      type: "duplicate",
      title: `${totalDuplicates} possível(eis) duplicata(s)`,
      description: `${duplicates.length} grupo(s) de transações similares`,
      severity: "warning",
      data: { groups: duplicates.slice(0, 3), totalGroups: duplicates.length },
      actions: [
        { label: "Revisar duplicatas", action: "review_duplicates" },
      ],
    });
    byType.duplicate = totalDuplicates;
  }

  // Pending splits
  items.push(...pendingSplits);
  if (pendingSplits.length > 0) {
    byType.pending_split = pendingSplits.length;
  }

  // PRO expiring
  if (proWarning) {
    items.push(proWarning);
    byType.pro_expiring = 1;
  }

  return {
    total: items.length,
    byType,
    items,
  };
}

// Delete duplicate transactions (keep first, delete rest)
export async function deleteDuplicates(
  householdId: string,
  transactionIds: string[]
): Promise<number> {
  if (!householdId || transactionIds.length === 0) return 0;

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId)
    .in("id", transactionIds);

  if (error) throw error;

  return transactionIds.length;
}

// Bulk categorize transactions
export async function bulkCategorize(
  householdId: string,
  updates: Array<{ id: string; category: CategoryType }>
): Promise<number> {
  if (!householdId || updates.length === 0) return 0;

  let updated = 0;
  for (const update of updates) {
    const { error } = await supabase
      .from("transactions")
      .update({ category: update.category })
      .eq("id", update.id)
      .eq("household_id", householdId);

    if (!error) updated++;
  }

  return updated;
}
