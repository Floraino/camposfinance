import { supabase } from "@/integrations/supabase/client";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PreviewDeletionParams {
  householdId: string;
  month?: number;
  year?: number;
  category?: string;
  startDate?: string;
  endDate?: string;
}

export interface PreviewDeletionResult {
  count: number;
  transactionIds: string[];
  sumAmount: number;
  rangeLabel: string;
  topCategories: { name: string; count: number }[];
  householdName: string;
}

export interface BatchDeleteParams {
  householdId: string;
  transactionIds: string[];
}

export interface BatchDeleteResult {
  requestedCount: number;
  deletedCount: number;
  failedIds: { id: string; reason: string }[];
  success: boolean;
  message: string;
}

// Category labels for display
const categoryLabels: Record<string, string> = {
  food: "Alimentação",
  transport: "Transporte",
  entertainment: "Lazer",
  health: "Saúde",
  education: "Educação",
  shopping: "Compras",
  bills: "Contas Fixas",
  other: "Outros",
};

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/**
 * Preview what will be deleted - returns full UUIDs and summary
 * Does NOT perform any deletion
 */
export async function previewDeletion(params: PreviewDeletionParams): Promise<PreviewDeletionResult> {
  const { householdId, month, year, category, startDate, endDate } = params;

  // Validate householdId
  if (!householdId || !UUID_REGEX.test(householdId)) {
    throw new Error("householdId inválido");
  }

  // Get current user to validate membership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Usuário não autenticado");
  }

  // Validate user is member of this household
  const { data: membership } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("household_id", householdId)
    .single();

  if (!membership) {
    throw new Error("Você não tem permissão para acessar esta família");
  }

  // Get household name
  const { data: household } = await supabase
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();

  const householdName = household?.name || "Família";

  // Build query
  let query = supabase
    .from("transactions")
    .select("id, amount, category, transaction_date")
    .eq("household_id", householdId);

  // Apply date filters
  let rangeLabel = "";
  if (startDate && endDate) {
    query = query.gte("transaction_date", startDate).lte("transaction_date", endDate);
    rangeLabel = `${startDate} a ${endDate}`;
  } else if (month !== undefined && year !== undefined) {
    const start = new Date(year, month, 1).toISOString().split("T")[0];
    const end = new Date(year, month + 1, 0).toISOString().split("T")[0];
    query = query.gte("transaction_date", start).lte("transaction_date", end);
    rangeLabel = `${monthNames[month]}/${year}`;
  } else {
    // Default to current month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    query = query.gte("transaction_date", start).lte("transaction_date", end);
    rangeLabel = `${monthNames[now.getMonth()]}/${now.getFullYear()}`;
  }

  // Apply category filter
  if (category) {
    query = query.eq("category", category);
    rangeLabel += ` (${categoryLabels[category] || category})`;
  }

  const { data: transactions, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar lançamentos: ${error.message}`);
  }

  const txList = transactions || [];
  
  // Calculate summary
  const transactionIds = txList.map(t => t.id); // Full UUIDs
  const sumAmount = txList.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  // Count by category
  const categoryCount: Record<string, number> = {};
  txList.forEach(t => {
    const cat = categoryLabels[t.category] || t.category;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    count: txList.length,
    transactionIds,
    sumAmount,
    rangeLabel,
    topCategories,
    householdName,
  };
}

/**
 * Delete transactions in batch - validates all UUIDs and household membership
 */
export async function deleteTransactionsBatch(params: BatchDeleteParams): Promise<BatchDeleteResult> {
  const { householdId, transactionIds } = params;

  // Validate householdId
  if (!householdId || !UUID_REGEX.test(householdId)) {
    return {
      requestedCount: transactionIds.length,
      deletedCount: 0,
      failedIds: transactionIds.map(id => ({ id, reason: "householdId inválido" })),
      success: false,
      message: "householdId inválido",
    };
  }

  // Validate all transaction IDs are valid UUIDs
  const invalidIds = transactionIds.filter(id => !UUID_REGEX.test(id));
  if (invalidIds.length > 0) {
    return {
      requestedCount: transactionIds.length,
      deletedCount: 0,
      failedIds: invalidIds.map(id => ({ id, reason: "UUID inválido" })),
      success: false,
      message: `${invalidIds.length} IDs com formato inválido. Nenhuma exclusão realizada.`,
    };
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      requestedCount: transactionIds.length,
      deletedCount: 0,
      failedIds: transactionIds.map(id => ({ id, reason: "Usuário não autenticado" })),
      success: false,
      message: "Usuário não autenticado",
    };
  }

  // Validate user is member of this household
  const { data: membership } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("household_id", householdId)
    .single();

  if (!membership) {
    return {
      requestedCount: transactionIds.length,
      deletedCount: 0,
      failedIds: transactionIds.map(id => ({ id, reason: "Sem permissão para esta família" })),
      success: false,
      message: "Você não tem permissão para esta família",
    };
  }

  // Verify all transactions belong to this household before deleting
  const { data: existingTxs } = await supabase
    .from("transactions")
    .select("id")
    .eq("household_id", householdId)
    .in("id", transactionIds);

  const existingIds = new Set((existingTxs || []).map(t => t.id));
  const notFoundIds = transactionIds.filter(id => !existingIds.has(id));

  if (notFoundIds.length > 0) {
    return {
      requestedCount: transactionIds.length,
      deletedCount: 0,
      failedIds: notFoundIds.map(id => ({ id, reason: "Não encontrado ou não pertence a esta família" })),
      success: false,
      message: `${notFoundIds.length} lançamentos não encontrados ou não pertencem a esta família. Nenhuma exclusão realizada.`,
    };
  }

  // Perform the batch delete
  const { error, count } = await supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId)
    .in("id", transactionIds);

  if (error) {
    return {
      requestedCount: transactionIds.length,
      deletedCount: 0,
      failedIds: transactionIds.map(id => ({ id, reason: error.message })),
      success: false,
      message: `Erro ao excluir: ${error.message}`,
    };
  }

  const deletedCount = count ?? transactionIds.length;

  // Log the action for audit
  try {
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: user.id,
      target_type: "transactions",
      target_id: householdId,
      action_type: "BATCH_DELETE_TRANSACTIONS",
      metadata: {
        household_id: householdId,
        requested_count: transactionIds.length,
        deleted_count: deletedCount,
        transaction_ids: transactionIds.slice(0, 10), // Log first 10 for reference
      },
    });
  } catch (e) {
    console.warn("Failed to log audit event:", e);
  }

  return {
    requestedCount: transactionIds.length,
    deletedCount,
    failedIds: [],
    success: deletedCount === transactionIds.length,
    message: deletedCount === transactionIds.length
      ? `${deletedCount} lançamentos excluídos com sucesso!`
      : `Apenas ${deletedCount} de ${transactionIds.length} lançamentos foram excluídos.`,
  };
}
