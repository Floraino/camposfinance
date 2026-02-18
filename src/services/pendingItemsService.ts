import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";
import type { Transaction } from "@/services/transactionService";

export type PendingItemType =
  | "uncategorized"
  | "duplicate"
  | "no_account"
  | "pending_split"
  | "pro_expiring"
  // v2 types (smart pending)
  | "overdue_bill"
  | "upcoming_bill"
  | "missing_recurring"
  | "budget_exceeded"
  | "budget_warning"
  | "inactivity";

export interface PendingItem {
  id: string;
  type: PendingItemType;
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

// ========================================================================
// SMART PENDING v2 — new insight sections (added around existing code)
// ========================================================================

/**
 * 1) Boletos / bills pending by due date.
 *    - Overdue: status='pending' AND due_date < today
 *    - Upcoming: status='pending' AND due_date within next 7 days
 */
export async function getPendingBills(householdId: string): Promise<PendingItem[]> {
  if (!householdId) return [];

  const today = new Date().toISOString().split("T")[0];
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const items: PendingItem[] = [];

  // Overdue bills
  const { data: overdue, error: errOverdue } = await supabase
    .from("transactions")
    .select("id, description, amount, due_date")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .not("due_date", "is", null)
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(20);

  if (!errOverdue && overdue && overdue.length > 0) {
    for (const tx of overdue) {
      items.push({
        id: `overdue-${tx.id}`,
        type: "overdue_bill",
        title: `Vencido: ${tx.description}`,
        description: `R$ ${Math.abs(tx.amount).toFixed(2)} — venceu em ${formatDateBR(tx.due_date)}`,
        severity: "error",
        data: { transactionId: tx.id, dueDate: tx.due_date, amount: tx.amount },
        actions: [
          { label: "Marcar como pago", action: `mark_paid:${tx.id}` },
          { label: "Ver", action: `view_transaction:${tx.id}` },
        ],
      });
    }
  }

  // Upcoming bills (next 7 days)
  const { data: upcoming, error: errUpcoming } = await supabase
    .from("transactions")
    .select("id, description, amount, due_date")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .not("due_date", "is", null)
    .gte("due_date", today)
    .lte("due_date", in7days)
    .order("due_date", { ascending: true })
    .limit(20);

  if (!errUpcoming && upcoming && upcoming.length > 0) {
    for (const tx of upcoming) {
      const daysLeft = Math.ceil(
        (new Date(tx.due_date).getTime() - Date.now()) / 86400000
      );
      items.push({
        id: `upcoming-${tx.id}`,
        type: "upcoming_bill",
        title: `Vence em ${daysLeft}d: ${tx.description}`,
        description: `R$ ${Math.abs(tx.amount).toFixed(2)} — vence ${formatDateBR(tx.due_date)}`,
        severity: daysLeft <= 3 ? "warning" : "info",
        data: { transactionId: tx.id, dueDate: tx.due_date, amount: tx.amount, daysLeft },
        actions: [
          { label: "Marcar como pago", action: `mark_paid:${tx.id}` },
        ],
      });
    }
  }

  return items;
}

/**
 * 2) Recorrentes não registrados este mês.
 *    Heurística: pega transações is_recurring=true que existiram em meses anteriores
 *    mas NÃO aparecem no mês corrente (mesma descrição normalizada).
 */
export async function getMissingRecurring(householdId: string): Promise<PendingItem[]> {
  if (!householdId) return [];

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];

  // Recurring transactions from the last 3 months
  const { data: pastRecurring, error: errPast } = await supabase
    .from("transactions")
    .select("description, amount")
    .eq("household_id", householdId)
    .eq("is_recurring", true)
    .gte("transaction_date", threeMonthsAgo)
    .lt("transaction_date", currentMonthStart);

  if (errPast || !pastRecurring || pastRecurring.length === 0) return [];

  // Unique recurring descriptions (normalized)
  const recurringDescs = new Map<string, number>();
  for (const tx of pastRecurring) {
    const key = tx.description.toLowerCase().trim();
    if (!recurringDescs.has(key)) {
      recurringDescs.set(key, Math.abs(tx.amount));
    }
  }

  // Current month transactions
  const { data: currentTxs, error: errCurrent } = await supabase
    .from("transactions")
    .select("description")
    .eq("household_id", householdId)
    .gte("transaction_date", currentMonthStart)
    .lte("transaction_date", currentMonthEnd);

  if (errCurrent) return [];

  const currentDescs = new Set(
    (currentTxs || []).map((tx: { description: string }) => tx.description.toLowerCase().trim())
  );

  const items: PendingItem[] = [];
  for (const [desc, avgAmount] of recurringDescs) {
    if (!currentDescs.has(desc)) {
      items.push({
        id: `missing-recurring-${desc.replace(/\s+/g, "-").slice(0, 30)}`,
        type: "missing_recurring",
        title: `Faltou registrar: ${capitalize(desc)}`,
        description: `Valor habitual: ~R$ ${avgAmount.toFixed(2)} — não aparece este mês`,
        severity: "warning",
        data: { description: desc, avgAmount },
        actions: [
          { label: "Adicionar agora", action: `add_recurring:${desc}` },
          { label: "Ignorar", action: `dismiss:missing-recurring-${desc}` },
        ],
      });
    }
  }

  return items;
}

/**
 * 3) Orçamento estourado / em alerta por categoria.
 *    Só funciona se existirem metas (category_budgets). Se não tiver, retorna [].
 */
export async function getBudgetAlerts(householdId: string): Promise<PendingItem[]> {
  if (!householdId) return [];

  const now = new Date();
  const month = now.getMonth() + 1; // DB stores 1-12
  const year = now.getFullYear();
  const startOfMonth = new Date(year, now.getMonth(), 1).toISOString().split("T")[0];
  const endOfMonth = new Date(year, now.getMonth() + 1, 0).toISOString().split("T")[0];

  // Fetch category budgets
  const { data: budgets, error: errBudgets } = await supabase
    .from("category_budgets")
    .select("category, amount, alert_threshold")
    .eq("household_id", householdId)
    .eq("month", month)
    .eq("year", year);

  if (errBudgets || !budgets || budgets.length === 0) return [];

  // Fetch spending per category this month
  const { data: txs, error: errTxs } = await supabase
    .from("transactions")
    .select("category, amount")
    .eq("household_id", householdId)
    .gte("transaction_date", startOfMonth)
    .lte("transaction_date", endOfMonth)
    .lt("amount", 0);

  if (errTxs) return [];

  const spentByCategory: Record<string, number> = {};
  for (const tx of txs || []) {
    spentByCategory[tx.category] = (spentByCategory[tx.category] || 0) + Math.abs(tx.amount);
  }

  const items: PendingItem[] = [];
  const categoryLabels: Record<string, string> = {
    food: "Alimentação", transport: "Transporte", bills: "Contas Fixas",
    health: "Saúde", education: "Educação", shopping: "Compras",
    leisure: "Lazer", other: "Outros",
  };

  for (const budget of budgets) {
    const spent = spentByCategory[budget.category] || 0;
    const pct = Math.round((spent / budget.amount) * 100);
    const threshold = budget.alert_threshold || 80;
    const label = categoryLabels[budget.category] || budget.category;

    if (pct >= 100) {
      items.push({
        id: `budget-exceeded-${budget.category}`,
        type: "budget_exceeded",
        title: `🚨 ${label} estourou o orçamento`,
        description: `R$ ${spent.toFixed(2)} / R$ ${budget.amount.toFixed(2)} (${pct}%)`,
        severity: "error",
        data: { category: budget.category, spent, budget: budget.amount, pct },
      });
    } else if (pct >= threshold) {
      items.push({
        id: `budget-warning-${budget.category}`,
        type: "budget_warning",
        title: `⚠️ ${label} perto do limite`,
        description: `R$ ${spent.toFixed(2)} / R$ ${budget.amount.toFixed(2)} (${pct}%)`,
        severity: "warning",
        data: { category: budget.category, spent, budget: budget.amount, pct },
      });
    }
  }

  return items;
}

/**
 * 4) Inatividade: sem registrar gastos há X dias.
 */
export async function getInactivityAlert(
  householdId: string,
  thresholdDays = 7
): Promise<PendingItem | null> {
  if (!householdId) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("transaction_date")
    .eq("household_id", householdId)
    .order("transaction_date", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return {
      id: "inactivity-no-tx",
      type: "inactivity",
      title: "Nenhum gasto registrado",
      description: "Comece adicionando suas transações para acompanhar as finanças da família.",
      severity: "info",
    };
  }

  const lastDate = new Date(data[0].transaction_date);
  const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);

  if (daysSince >= thresholdDays) {
    return {
      id: "inactivity-alert",
      type: "inactivity",
      title: `Sem registrar gastos há ${daysSince} dias`,
      description: `Último lançamento em ${formatDateBR(data[0].transaction_date)}. Mantenha o hábito!`,
      severity: daysSince >= 14 ? "warning" : "info",
      data: { daysSince, lastDate: data[0].transaction_date },
      actions: [
        { label: "Adicionar gasto", action: "add_transaction" },
      ],
    };
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Get all pending items for the household
export async function getAllPendingItems(householdId: string): Promise<PendingSummary> {
  if (!householdId) {
    return { total: 0, byType: {}, items: [] };
  }

  const [
    uncategorized, duplicates, pendingSplits, proWarning,
    // v2 smart insights
    pendingBills, missingRecurring, budgetAlerts, inactivityAlert,
  ] = await Promise.all([
    getUncategorizedTransactions(householdId),
    getDuplicateTransactions(householdId),
    getPendingSplitPayments(householdId),
    getProExpirationWarning(householdId),
    // v2
    getPendingBills(householdId),
    getMissingRecurring(householdId),
    getBudgetAlerts(householdId),
    getInactivityAlert(householdId),
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

  // ── v2 smart insights ──────────────────────────────────────────────────
  // Overdue / upcoming bills
  if (pendingBills.length > 0) {
    items.push(...pendingBills);
    byType.overdue_bill = pendingBills.filter((i) => i.type === "overdue_bill").length;
    byType.upcoming_bill = pendingBills.filter((i) => i.type === "upcoming_bill").length;
  }

  // Missing recurring
  if (missingRecurring.length > 0) {
    items.push(...missingRecurring);
    byType.missing_recurring = missingRecurring.length;
  }

  // Budget alerts
  if (budgetAlerts.length > 0) {
    items.push(...budgetAlerts);
    byType.budget_exceeded = budgetAlerts.filter((i) => i.type === "budget_exceeded").length;
    byType.budget_warning = budgetAlerts.filter((i) => i.type === "budget_warning").length;
  }

  // Inactivity
  if (inactivityAlert) {
    items.push(inactivityAlert);
    byType.inactivity = 1;
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
