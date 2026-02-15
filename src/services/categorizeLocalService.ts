/**
 * Categorização local (SEM IA): cache + category_rules.
 * Endpoint lógico: POST /api/transactions/categorize/local -> chama categorizeLocal().
 */

import { supabase } from "@/integrations/supabase/client";
import { getCategoryRulesForFamily } from "./categoryRulesService";
import { getCacheByFingerprints } from "./merchantCategoryCacheService";
import { setCacheFromRule } from "./merchantCategoryCacheService";
import {
  categorizeOne,
  shouldAutoApply,
  merchantFingerprint,
  type TxInput,
} from "./categorizationEngineLocal";

export interface CategorizeLocalResult {
  applied: number;
  skipped: number;
  errors: string[];
}

/**
 * Carrega transações sem categoria (category = 'other') e aplica cache + regras.
 * Salva category nas transações e atualiza cache com source='rule'.
 */
export async function categorizeLocal(
  familyId: string,
  transactionIds?: string[]
): Promise<CategorizeLocalResult> {
  const result: CategorizeLocalResult = { applied: 0, skipped: 0, errors: [] };

  if (!familyId) {
    result.errors.push("familyId é obrigatório");
    return result;
  }

  let query = supabase
    .from("transactions")
    .select("id, description, amount, transaction_date, category")
    .eq("household_id", familyId)
    .eq("category", "other")
    .order("transaction_date", { ascending: false })
    .limit(200);

  if (transactionIds?.length) {
    query = query.in("id", transactionIds);
  }

  const { data: transactions, error: fetchError } = await query;

  if (fetchError) {
    result.errors.push(fetchError.message);
    return result;
  }
  if (!transactions?.length) {
    return result;
  }

  const txs: TxInput[] = transactions.map((t: { id: string; description: string | null; amount?: number; transaction_date?: string }) => ({
    id: t.id,
    description: t.description ?? "",
    amount: t.amount,
    transaction_date: t.transaction_date,
  }));

  const [rules, fingerprints] = await Promise.all([
    getCategoryRulesForFamily(familyId),
    Promise.resolve(txs.map((tx) => merchantFingerprint(tx.description))),
  ]);

  const cacheMap = await getCacheByFingerprints(familyId, fingerprints);
  const cacheMapStr = new Map<string, string>();
  cacheMap.forEach((v, k) => cacheMapStr.set(k, v));

  const toApply: Array<{ id: string; categoryId: string; fingerprint: string }> = [];

  for (const tx of txs) {
    const match = categorizeOne(tx, cacheMapStr, rules);
    if (match && shouldAutoApply(match.confidence)) {
      toApply.push({
        id: tx.id,
        categoryId: match.categoryId,
        fingerprint: merchantFingerprint(tx.description),
      });
    } else {
      result.skipped++;
    }
  }

  for (const item of toApply) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ category: item.categoryId })
      .eq("id", item.id);

    if (updateError) {
      result.errors.push(`Erro ao atualizar ${item.id}`);
    } else {
      result.applied++;
      await setCacheFromRule(familyId, item.fingerprint, item.categoryId);
    }
  }

  return result;
}
