import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";
import {
  categorizeOne,
  merchantFingerprint,
  shouldAutoApply,
  isValidCategory,
  ALLOWED_CATEGORIES,
  type TransactionInput,
  type CategorizationResultItem,
} from "@/services/categorizationEngine";
import { getCategorizationRules } from "@/services/categorizationRulesService";
import { getCacheByFingerprints, setCacheBatch } from "@/services/merchantCategoryCacheService";

/**
 * Categorize a single description using the edge function.
 * Uses supabase.functions.invoke (sends session token automatically).
 * Falls back to local keyword matching if edge function is unavailable.
 */
export async function categorizeDescription(description: string): Promise<CategoryType> {
  if (!description || description.length < 3) {
    return "other";
  }

  // Local keyword matching first (fast path, works without Edge Function)
  const localResult = localCategorize(description);
  if (localResult !== "other") return localResult;

  try {
    const { data, error } = await supabase.functions.invoke("categorize-transaction", {
      body: { description },
    });

    if (error) {
      console.warn("[categorize] Edge function error (using local fallback):", error.message);
      return "other";
    }

    return (data?.category as CategoryType) || "other";
  } catch (err) {
    console.warn("[categorize] Network error (using local fallback):", err);
    return "other";
  }
}

// Local keyword matching (runs without backend)
const LOCAL_KEYWORDS: Record<string, CategoryType> = {
  mercado: "food", supermercado: "food", restaurante: "food", lanche: "food",
  padaria: "food", ifood: "food", "uber eats": "food", delivery: "food",
  açougue: "food", feira: "food", almoço: "food", jantar: "food", café: "food",
  uber: "transport", "99": "transport", gasolina: "transport", combustível: "transport",
  estacionamento: "transport", pedágio: "transport", ônibus: "transport",
  luz: "bills", água: "bills", internet: "bills", telefone: "bills",
  aluguel: "bills", condomínio: "bills", energia: "bills", celular: "bills",
  farmácia: "health", médico: "health", hospital: "health", dentista: "health",
  plano: "health", drogaria: "health", academia: "health",
  escola: "education", faculdade: "education", curso: "education", livro: "education",
  roupa: "shopping", sapato: "shopping", loja: "shopping", amazon: "shopping",
  "mercado livre": "shopping", magazine: "shopping", shopping: "shopping",
  cinema: "leisure", netflix: "leisure", spotify: "leisure", disney: "leisure",
  viagem: "leisure", hotel: "leisure", bar: "leisure", show: "leisure",
};

function localCategorize(description: string): CategoryType {
  const lower = description.toLowerCase();
  for (const [keyword, category] of Object.entries(LOCAL_KEYWORDS)) {
    if (lower.includes(keyword)) return category;
  }
  return "other";
}

/**
 * Categoriza transações sem categoria: local-first (cache + regras), depois IA para o restante.
 * Delega para categorizeTransactionsService.
 */
export async function categorizeAllTransactions(householdId?: string): Promise<{ updated: number; errors: string[] }> {
  if (!householdId) {
    console.warn("[categorizeAll] householdId não fornecido — abortando para evitar data leak");
    return { updated: 0, errors: ["householdId é obrigatório"] };
  }

  const { categorizeTransactionsService } = await import("@/services/categorizeTransactionsService");
  const result = await categorizeTransactionsService({
    familyId: householdId,
    useAI: true,
  });

  const updated =
    result.appliedByCache + result.appliedByRules + result.appliedByAI;
  return { updated, errors: result.errors };
}

/**
 * Recategoriza apenas transações sem categoria (other): local-first + IA.
 * Não sobrescreve categorias já definidas (manual/cache/regra).
 */
export async function recategorizeAllTransactions(householdId?: string): Promise<{ updated: number; errors: string[] }> {
  return categorizeAllTransactions(householdId);
}

// ========== Motor híbrido: Regras → Cache → IA (fallback) ==========

export interface RunCategorizationResult {
  applied: number;
  suggested: number;
  skipped: number;
  byRules: number;
  byCache: number;
  byAi: number;
  aiUnavailable?: boolean;
  suggestions?: Array<{ id: string; description: string; category: CategoryType; confidence: number }>;
  errors: string[];
}

/**
 * Pipeline: 1) Regras (built-in + user) 2) Cache 3) IA só para o restante.
 * Só processa transações com category = 'other'.
 */
export async function runCategorizationPipeline(
  householdId: string | undefined,
  onProgress?: (message: string) => void
): Promise<RunCategorizationResult> {
  const result: RunCategorizationResult = {
    applied: 0,
    suggested: 0,
    skipped: 0,
    byRules: 0,
    byCache: 0,
    byAi: 0,
    errors: [],
  };

  if (!householdId) {
    result.errors.push("householdId é obrigatório");
    return result;
  }

  onProgress?.("Carregando transações sem categoria…");
  const { data: transactions, error: fetchError } = await supabase
    .from("transactions")
    .select("id, description, amount, transaction_date, category")
    .eq("household_id", householdId)
    .eq("category", "other")
    .order("transaction_date", { ascending: false })
    .limit(100);

  if (fetchError) {
    result.errors.push(fetchError.message);
    return result;
  }
  if (!transactions?.length) {
    return result;
  }

  const txs: TransactionInput[] = transactions.map((t) => ({
    id: t.id,
    description: t.description ?? "",
    amount: t.amount,
    transaction_date: t.transaction_date,
  }));

  onProgress?.("Aplicando regras…");
  let userRules: Array<{ pattern: string; match_type: "contains" | "starts_with" | "exact"; category: string; priority: number }> = [];
  try {
    const rules = await getCategorizationRules(householdId);
    userRules = rules.filter((r) => r.is_active).map((r) => ({ pattern: r.pattern, match_type: r.match_type, category: r.category, priority: r.priority }));
  } catch (e) {
    console.warn("[runCategorizationPipeline] getCategorizationRules error:", e);
  }

  onProgress?.("Aplicando histórico…");
  let cacheMap = new Map<string, CategoryType>();
  try {
    const fingerprints = txs.map((t) => merchantFingerprint(t.description));
    cacheMap = await getCacheByFingerprints(householdId, fingerprints);
  } catch (e) {
    console.warn("[runCategorizationPipeline] getCacheByFingerprints error:", e);
  }

  const toApply: CategorizationResultItem[] = [];
  const toSuggest: CategorizationResultItem[] = [];
  const forAi: TransactionInput[] = [];

  for (const tx of txs) {
    const one = categorizeOne(tx, cacheMap, userRules);
    if (one) {
      if (shouldAutoApply(one.confidence)) {
        toApply.push({ id: tx.id, category: one.category, confidence: one.confidence, source: one.source });
      } else {
        toSuggest.push({ id: tx.id, category: one.category, confidence: one.confidence, source: one.source });
      }
    } else {
      forAi.push(tx);
    }
  }

  result.byRules = toApply.filter((a) => a.source === "rule").length + toSuggest.filter((a) => a.source === "rule").length;
  result.byCache = toApply.filter((a) => a.source === "cache").length + toSuggest.filter((a) => a.source === "cache").length;

  let aiResults: Array<{ id: string; category: string; confidence: number }> = [];
  if (forAi.length > 0) {
    onProgress?.("Consultando IA…");
    try {
      const { data: aiData, error: aiError } = await supabase.functions.invoke("categorize-transaction", {
        body: {
          categorizeAll: true,
          descriptions: forAi.map((t) => ({ id: t.id, description: t.description })),
          allowedCategories: ALLOWED_CATEGORIES,
        },
      });
      if (!aiError && aiData?.categories && Array.isArray(aiData.categories)) {
        aiResults = aiData.categories.filter(
          (c: { id: string; category: string; confidence?: number }) =>
            c.id && c.category && isValidCategory(c.category)
        );
      } else {
        result.aiUnavailable = true;
      }
    } catch {
      result.aiUnavailable = true;
    }
  }

  for (const c of aiResults) {
    const conf = Number(c.confidence) || 0.5;
    if (conf >= 0.85) {
      toApply.push({ id: c.id, category: c.category as CategoryType, confidence: conf, source: "ai" });
    } else {
      toSuggest.push({ id: c.id, category: c.category as CategoryType, confidence: conf, source: "ai" });
    }
  }
  result.byAi = toApply.filter((a) => a.source === "ai").length + toSuggest.filter((a) => a.source === "ai").length;
  result.skipped = forAi.length - aiResults.length;

  // Persistir aplicados
  for (const item of toApply) {
    const { error: updateError } = await supabase.from("transactions").update({ category: item.category }).eq("id", item.id);
    if (updateError) {
      result.errors.push(`Erro ao atualizar ${item.id}`);
    } else {
      result.applied++;
    }
  }

  result.suggested = toSuggest.length;
  result.suggestions = toSuggest.map((s) => {
    const tx = txs.find((t) => t.id === s.id);
    return { id: s.id, description: tx?.description ?? "", category: s.category, confidence: s.confidence };
  });

  // Salvar no cache os aplicados (regras + cache + AI alta confiança) para próximas vezes
  try {
    const cacheEntries = toApply.map((item) => {
      const tx = txs.find((t) => t.id === item.id);
      const fp = tx ? merchantFingerprint(tx.description) : "";
      return { fingerprint: fp, category: item.category, confidence: item.confidence };
    }).filter((e) => e.fingerprint);
    if (cacheEntries.length) await setCacheBatch(householdId, cacheEntries);
  } catch (e) {
    console.warn("[runCategorizationPipeline] setCacheBatch error:", e);
  }

  return result;
}
