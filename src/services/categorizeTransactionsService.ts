/**
 * Pipeline de categorização: SEMPRE local-first (cache + category_rules), IA só para o restante.
 * IA nunca sobrescreve categoria já definida por cache/regra/manual.
 */

import { supabase } from "@/integrations/supabase/client";
import { getCategoryRulesForFamily } from "./categoryRulesService";
import { getCacheByFingerprints, setCacheFromRule } from "./merchantCategoryCacheService";
import {
  categorizeOne,
  shouldAutoApply,
  merchantFingerprint,
  type TxInput,
} from "./categorizationEngineLocal";
import { ALLOWED_CATEGORIES, isValidCategory } from "./categorizationEngine";

const AI_BATCH_SIZE = 80;
const LOCAL_CONFIDENCE_THRESHOLD = 0.85;

const AI_UNAVAILABLE_MESSAGE =
  "IA indisponível (conexão ou CORS). Em localhost use 'supabase functions serve' ou publique a Edge Function.";

function normalizeAiErrorMessage(error: unknown): string {
  const msg =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : typeof error === "string"
        ? error
        : "";
  const lower = msg.toLowerCase();
  if (
    lower.includes("edge function") ||
    lower.includes("cors") ||
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("err_failed") ||
    lower.includes("failed to send")
  ) {
    return AI_UNAVAILABLE_MESSAGE;
  }
  return msg && msg.length < 120 ? msg : AI_UNAVAILABLE_MESSAGE;
}

export interface CategorizeTransactionsOptions {
  familyId: string;
  /** Se não informado, processa todas sem categoria (other). */
  transactionIds?: string[];
  /** Se true e houver remanescentes após local, chama IA em batch. */
  useAI?: boolean;
}

export interface CategorizeTransactionsResult {
  appliedByCache: number;
  appliedByRules: number;
  sentToAI: number;
  appliedByAI: number;
  remainingUncategorized: number;
  errors: string[];
  /** Sugestões de baixa confiança (IA ou regra < threshold). */
  suggestions?: Array<{ id: string; description: string; category: string; confidence: number }>;
}

/**
 * Ordem obrigatória: 1) Manual (já categorizado) — não tocar.
 * 2) Cache (confiança 1.0). 3) Regras (>= LOCAL_CONFIDENCE_THRESHOLD). 4) IA só para remanescentes.
 */
export async function categorizeTransactionsService(
  options: CategorizeTransactionsOptions
): Promise<CategorizeTransactionsResult> {
  const { familyId, transactionIds, useAI = false } = options;
  const result: CategorizeTransactionsResult = {
    appliedByCache: 0,
    appliedByRules: 0,
    sentToAI: 0,
    appliedByAI: 0,
    remainingUncategorized: 0,
    errors: [],
  };

  if (!familyId) {
    result.errors.push("familyId é obrigatório");
    return result;
  }

  // Carregar transações sem categoria (só category = 'other')
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

  const txs: TxInput[] = transactions.map((t) => ({
    id: t.id,
    description: t.description ?? "",
    amount: t.amount,
    transaction_date: t.transaction_date,
  }));

  const fingerprints = txs.map((tx) => merchantFingerprint(tx.description));
  const [rules, cacheRows] = await Promise.all([
    getCategoryRulesForFamily(familyId),
    getCacheByFingerprints(familyId, fingerprints),
  ]);

  const cacheMapStr = new Map<string, string>();
  cacheRows.forEach((v, k) => cacheMapStr.set(k, v));

  // Passo 1 (sem IA): aplicar cache e regras
  const appliedByCache: Array<{ id: string; categoryId: string; fp: string }> = [];
  const appliedByRules: Array<{ id: string; categoryId: string; fp: string }> = [];
  const remaining: TxInput[] = [];

  for (const tx of txs) {
    const match = categorizeOne(tx, cacheMapStr, rules);
    if (match && shouldAutoApply(match.confidence)) {
      if (match.source === "cache") {
        appliedByCache.push({
          id: tx.id,
          categoryId: match.categoryId,
          fp: merchantFingerprint(tx.description),
        });
      } else {
        appliedByRules.push({
          id: tx.id,
          categoryId: match.categoryId,
          fp: merchantFingerprint(tx.description),
        });
      }
    } else {
      remaining.push(tx);
    }
  }

  // Persistir aplicados por cache
  for (const item of appliedByCache) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ category: item.categoryId })
      .eq("id", item.id);
    if (updateError) {
      result.errors.push(`Erro ao atualizar ${item.id}`);
    } else {
      result.appliedByCache++;
    }
  }

  // Persistir aplicados por regras e atualizar cache
  for (const item of appliedByRules) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ category: item.categoryId })
      .eq("id", item.id);
    if (updateError) {
      result.errors.push(`Erro ao atualizar ${item.id}`);
    } else {
      result.appliedByRules++;
      await setCacheFromRule(familyId, item.fp, item.categoryId);
    }
  }

  // Passo 2 (com IA): apenas remanescentes, em batch
  if (useAI && remaining.length > 0) {
    const batches: TxInput[][] = [];
    for (let i = 0; i < remaining.length; i += AI_BATCH_SIZE) {
      batches.push(remaining.slice(i, i + AI_BATCH_SIZE));
    }

    let aiErrorReported = false;
    for (const batch of batches) {
      result.sentToAI += batch.length;
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke(
          "categorize-transaction",
          {
            body: {
              categorizeAll: true,
              descriptions: batch.map((t) => ({ id: t.id, description: t.description })),
              allowedCategories: ALLOWED_CATEGORIES,
            },
          }
        );

        if (aiError) {
          if (!aiErrorReported) {
            result.errors.push(normalizeAiErrorMessage(aiError));
            aiErrorReported = true;
          }
          result.remainingUncategorized += batch.length;
          continue;
        }

        const categories = (aiData?.categories as Array<{ id: string; category: string; confidence?: number }>) ?? [];
        const toApply: Array<{ id: string; category: string; confidence: number }> = [];
        const toSuggest: Array<{ id: string; category: string; confidence: number }> = [];

        for (const c of categories) {
          if (!c?.id || !c.category) continue;
          const category = String(c.category).toLowerCase();
          if (!isValidCategory(category)) continue;
          const confidence = Number(c.confidence) ?? 0.85;
          if (confidence >= LOCAL_CONFIDENCE_THRESHOLD) {
            toApply.push({ id: c.id, category, confidence });
          } else {
            toSuggest.push({ id: c.id, category, confidence });
          }
        }

        for (const item of toApply) {
          const { error: updateError } = await supabase
            .from("transactions")
            .update({ category: item.category })
            .eq("id", item.id);
          if (updateError) {
            result.errors.push(`Erro ao atualizar ${item.id}`);
          } else {
            result.appliedByAI++;
          }
        }

        const appliedIds = new Set(toApply.map((a) => a.id));
        const stillUncategorized = batch.filter((t) => !appliedIds.has(t.id)).length;
        result.remainingUncategorized += stillUncategorized;

        if (toSuggest.length) {
          result.suggestions = result.suggestions ?? [];
          for (const s of toSuggest) {
            const tx = batch.find((t) => t.id === s.id);
            result.suggestions.push({
              id: s.id,
              description: tx?.description ?? "",
              category: s.category,
              confidence: s.confidence,
            });
          }
        }
      } catch (e) {
        if (!aiErrorReported) {
          result.errors.push(normalizeAiErrorMessage(e));
          aiErrorReported = true;
        }
        result.remainingUncategorized += batch.length;
      }
    }
  } else {
    result.remainingUncategorized = remaining.length;
  }

  return result;
}
