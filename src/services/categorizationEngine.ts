/**
 * Motor híbrido de categorização: normalização + regras determinísticas + cache + IA fallback.
 * Usa apenas categorias do app (CategoryType em CategoryBadge).
 */

import type { CategoryType } from "@/components/ui/CategoryBadge";

// ========== Categorias permitidas (exatamente as do app) ==========
export const ALLOWED_CATEGORIES: CategoryType[] = [
  "bills",
  "food",
  "leisure",
  "shopping",
  "transport",
  "health",
  "education",
  "other",
];

const VALID_CATEGORY_SET = new Set<string>(ALLOWED_CATEGORIES);

export function isValidCategory(cat: string): cat is CategoryType {
  return VALID_CATEGORY_SET.has(cat);
}

// ========== Normalização ==========
const NOISE_TOKENS = new Set([
  "pix", "enviado", "recebido", "debito", "credito", "aut", "pagamento",
  "compra", "doc", "ted", "transferencia", "referencia", "pf", "pj",
  "pag", "valor", "ref", "id", "nr", "num", "nº",
]);

/**
 * Normaliza texto para match: lowercase, sem acentos, pontuação colapsada, sem tokens inúteis.
 */
export function normalizeText(s: string): string {
  if (!s || typeof s !== "string") return "";
  let t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // remove acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // não-alfanum -> espaço
    .replace(/\s+/g, " ")
    .trim();
  const words = t.split(" ").filter((w) => w.length > 0 && !NOISE_TOKENS.has(w));
  return words.join(" ");
}

/**
 * Gera um "fingerprint" do merchant: remove datas, números longos, IDs, DOC/PF etc.
 */
export function merchantFingerprint(desc: string): string {
  const norm = normalizeText(desc);
  // Remove sequências longas de dígitos (contas, IDs)
  const withoutLongNumbers = norm.replace(/\b\d{5,}\b/g, "");
  // Pegar primeiros tokens significativos (geralmente nome do estabelecimento)
  const tokens = withoutLongNumbers.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
  return tokens.join(" ") || norm.slice(0, 50);
}

// ========== Regras determinísticas (mapeadas para categorias reais do app) ==========
export interface CategorizationRule {
  id: string;
  category: CategoryType;
  priority: number;
  pattern: RegExp;
  confidence: number;
}

/** Regras built-in: padrões fortes (alta confiança) e palavras comuns (menor). */
export const DEFAULT_RULES: CategorizationRule[] = [
  // Transporte
  { id: "transport-uber-99", category: "transport", priority: 100, pattern: /\b(uber|99\s*pop|99\s*app|in\s*driver)\b/i, confidence: 0.95 },
  { id: "transport-gas", category: "transport", priority: 90, pattern: /\b(posto|gasolina|combust[ií]vel|shell|ipiranga|br\s*distribuidora)\b/i, confidence: 0.9 },
  { id: "transport-parking", category: "transport", priority: 90, pattern: /\b(estacionamento|sem\s*parar|parking|ped[aá]gio)\b/i, confidence: 0.9 },
  { id: "transport-bus", category: "transport", priority: 85, pattern: /\b([oô]nibus|metro|metr[oô]|bilhete\s*[uú]nico)\b/i, confidence: 0.85 },
  // Alimentação
  { id: "food-ifood", category: "food", priority: 100, pattern: /\b(ifood|uber\s*eats|rappi| Rappi)\b/i, confidence: 0.95 },
  { id: "food-market", category: "food", priority: 95, pattern: /\b(supermercado|mercado|padaria|a[cç]ougue|hortifruti|atacad[aã]o)\b/i, confidence: 0.9 },
  { id: "food-restaurant", category: "food", priority: 90, pattern: /\b(restaurante|lanchonete|lanche|pizzaria|hamburgueria|caf[eé]|confeitaria)\b/i, confidence: 0.85 },
  { id: "food-delivery", category: "food", priority: 85, pattern: /\b(delivery|entrega)\b/i, confidence: 0.75 },
  // Contas fixas
  { id: "bills-rent", category: "bills", priority: 95, pattern: /\b(aluguel|condominio|condom[ií]nio)\b/i, confidence: 0.95 },
  { id: "bills-utils", category: "bills", priority: 95, pattern: /\b(luz|energia|agua|[aá]gua|enel|cpfl|sabesp)\b/i, confidence: 0.9 },
  { id: "bills-internet", category: "bills", priority: 90, pattern: /\b(internet|banda\s*larga|net\s*virtua|oi\s*fibra|vivo\s*fibra|claro\s*internet)\b/i, confidence: 0.9 },
  { id: "bills-phone", category: "bills", priority: 90, pattern: /\b(telefone|celular|tim|vivo|claro|oi)\b/i, confidence: 0.85 },
  // Saúde
  { id: "health-pharmacy", category: "health", priority: 95, pattern: /\b(farm[aá]cia|drogaria|droga\s*raia|drogasil|pacheco)\b/i, confidence: 0.95 },
  { id: "health-medical", category: "health", priority: 90, pattern: /\b(m[eé]dico|hospital|cl[ií]nica|laborat[oó]rio|exame|consulta)\b/i, confidence: 0.9 },
  { id: "health-gym", category: "health", priority: 85, pattern: /\b(academia|smart\s*fit|bio\s*ritmo)\b/i, confidence: 0.85 },
  // Educação
  { id: "education-school", category: "education", priority: 90, pattern: /\b(escola|faculdade|universidade|curso|ingles|idioma)\b/i, confidence: 0.9 },
  { id: "education-books", category: "education", priority: 85, pattern: /\b(livraria|livro|amazon\s*kindle)\b/i, confidence: 0.8 },
  // Lazer / assinaturas
  { id: "leisure-streaming", category: "leisure", priority: 100, pattern: /\b(netflix|spotify|disney\s*plus|amazon\s*prime|hbo|youtube\s*premium|deezer)\b/i, confidence: 0.95 },
  { id: "leisure-apple", category: "leisure", priority: 95, pattern: /\b(app\s*store|apple\s*\.com|itunes)\b/i, confidence: 0.9 },
  { id: "leisure-google", category: "leisure", priority: 95, pattern: /\b(google\s*play|google\s*one)\b/i, confidence: 0.9 },
  { id: "leisure-cinema", category: "leisure", priority: 85, pattern: /\b(cinema|cin[eé]polis|kinoplex|movie)\b/i, confidence: 0.85 },
  { id: "leisure-bar", category: "leisure", priority: 80, pattern: /\b(bar|pub|cervejaria)\b/i, confidence: 0.75 },
  // Compras
  { id: "shopping-amazon", category: "shopping", priority: 95, pattern: /\b(amazon|mercado\s*livre|magazine\s*luiza)\b/i, confidence: 0.9 },
  { id: "shopping-clothes", category: "shopping", priority: 85, pattern: /\b(roupa|sapato|loja|zara|renner|cea|riachuelo)\b/i, confidence: 0.8 },
  // Taxas / IOF / tarifas -> outros (não inventar categoria)
  { id: "other-iof", category: "other", priority: 90, pattern: /\b(iof|tarifa|juros|anuidade|multa|taxa)\b/i, confidence: 0.85 },
];

const RULES_BY_PRIORITY = [...DEFAULT_RULES].sort((a, b) => b.priority - a.priority);

/**
 * Aplica apenas regras built-in (síncrono). Retorna categoria e confiança ou null.
 */
export function applyBuiltInRules(description: string): { category: CategoryType; confidence: number } | null {
  const norm = normalizeText(description);
  const fullText = `${norm} ${description}`.toLowerCase();
  for (const rule of RULES_BY_PRIORITY) {
    if (rule.pattern.test(fullText) && isValidCategory(rule.category)) {
      return { category: rule.category, confidence: rule.confidence };
    }
  }
  return null;
}

// ========== Tipos do resultado do engine ==========
export interface TransactionInput {
  id: string;
  description: string;
  amount?: number;
  transaction_date?: string;
}

export interface CategorizationResultItem {
  id: string;
  category: string;
  confidence: number;
  source: "rule" | "cache" | "ai";
  reason?: string;
}

export interface CategorizationEngineResult {
  applied: CategorizationResultItem[];
  suggested: CategorizationResultItem[];
  skipped: { id: string; description: string }[];
  stats: {
    byRules: number;
    byCache: number;
    byAi: number;
    suggested: number;
    skipped: number;
  };
}

const AUTO_APPLY_THRESHOLD = 0.85;

/**
 * Categoriza uma transação usando regras do usuário + cache + regras built-in (sem IA).
 * category pode ser fixa (CategoryType) ou custom (custom:<uuid>).
 */
export function categorizeWithRulesAndCache(
  tx: TransactionInput,
  cacheCategory: string | null,
  userRuleCategory: string | null
): { category: string; confidence: number; source: "rule" | "cache" } | null {
  if (userRuleCategory) return { category: userRuleCategory, confidence: 0.95, source: "rule" };
  if (cacheCategory) return { category: cacheCategory, confidence: 0.95, source: "cache" };
  const builtIn = applyBuiltInRules(tx.description);
  if (builtIn) return { category: builtIn.category, confidence: builtIn.confidence, source: "rule" };
  return null;
}

/**
 * Categoriza uma transação com regras + cache. userRules e cacheMap vêm do pipeline.
 */
export function categorizeOne(
  tx: TransactionInput,
  cacheMap: Map<string, string>,
  userRules: UserRule[]
): { category: string; confidence: number; source: "rule" | "cache" } | null {
  const fp = merchantFingerprint(tx.description);
  const userCat = applyUserRules(tx.description, userRules);
  const cacheCat = cacheMap.get(fp) ?? null;
  return categorizeWithRulesAndCache(tx, cacheCat, userCat);
}

/**
 * Decide se aplica automaticamente ou só sugere (baseado em confidence).
 */
export function shouldAutoApply(confidence: number): boolean {
  return confidence >= AUTO_APPLY_THRESHOLD;
}

// ========== Regras do usuário (from DB) ==========
export interface UserRule {
  pattern: string;
  match_type: "contains" | "starts_with" | "exact";
  category: string;
  priority: number;
}

/**
 * Aplica regras do usuário (maior prioridade primeiro). Retorna categoria (fixa ou custom:<uuid>) ou null.
 */
export function applyUserRules(description: string, userRules: UserRule[]): string | null {
  const upper = description.toUpperCase();
  const sorted = userRules.slice().sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (!r.category?.trim()) continue;
    const pat = r.pattern.toUpperCase();
    const match =
      r.match_type === "exact"
        ? upper === pat
        : r.match_type === "starts_with"
          ? upper.startsWith(pat)
          : upper.includes(pat);
    if (match) return r.category;
  }
  return null;
}
