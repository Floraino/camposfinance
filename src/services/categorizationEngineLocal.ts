/**
 * Motor de categorização SEM IA: cache + regras do banco (category_rules).
 * Tie-breakers: equals > startsWith > contains > regex; depois maior confidence; depois maior match length.
 */

import {
  normalizeText,
  merchantFingerprint as _merchantFingerprint,
} from "./categorizationEngine";
import type { CategoryRuleRow } from "./categoryRulesService";

export { normalizeText, merchantFingerprint } from "./categorizationEngine";

export const AUTO_APPLY_CONFIDENCE = 0.85;

export interface TxInput {
  id: string;
  description: string;
  amount?: number;
  transaction_date?: string;
}

export interface MatchResult {
  categoryId: string;
  confidence: number;
  source: "cache" | "rule";
  ruleId?: string;
  matchLength?: number;
  matchType?: string;
}

/**
 * Ordem de força do matchType (maior = mais específico): equals > startsWith > contains > regex.
 */
function matchTypeStrength(mt: string): number {
  switch (mt) {
    case "equals": return 4;
    case "startsWith": return 3;
    case "contains": return 2;
    case "regex": return 1;
    default: return 0;
  }
}

/**
 * Aplica cache: se fingerprint está no mapa, retorna categoria.
 */
export function applyCacheFirst(
  tx: TxInput,
  cacheMap: Map<string, string>
): MatchResult | null {
  const fp = _merchantFingerprint(tx.description);
  const categoryId = cacheMap.get(fp);
  if (categoryId) return { categoryId, confidence: 0.95, source: "cache" };
  return null;
}

/**
 * Avalia uma regra contra o texto normalizado/upper.
 */
function ruleMatches(rule: CategoryRuleRow, description: string, upper: string): { match: boolean; matchLength: number } {
  const pat = rule.pattern.trim();
  const patUpper = pat.toUpperCase();
  switch (rule.match_type) {
    case "equals":
      return { match: upper === patUpper, matchLength: pat.length };
    case "startsWith":
      return { match: upper.startsWith(patUpper), matchLength: pat.length };
    case "contains":
      return { match: upper.includes(patUpper), matchLength: pat.length };
    case "regex": {
      try {
        const flags = rule.flags || "i";
        const re = new RegExp(pat, flags);
        const m = description.match(re);
        return { match: !!m, matchLength: m ? (m[0]?.length ?? 0) : 0 };
      } catch {
        return { match: false, matchLength: 0 };
      }
    }
    default:
      return { match: false, matchLength: 0 };
  }
}

/**
 * Aplica regras por priority desc; tie-break: matchType (equals > startsWith > contains > regex), confidence, match length.
 */
export function applyRules(
  tx: TxInput,
  rules: CategoryRuleRow[]
): MatchResult | null {
  const description = tx.description || "";
  const upper = description.toUpperCase();
  let best: MatchResult | null = null;
  let bestStrength = 0;
  let bestConfidence = 0;
  let bestMatchLength = 0;

  for (const rule of rules) {
    const { match, matchLength } = ruleMatches(rule, description, upper);
    if (!match) continue;
    const strength = matchTypeStrength(rule.match_type);
    const wins =
      strength > bestStrength ||
      (strength === bestStrength && rule.confidence > bestConfidence) ||
      (strength === bestStrength && rule.confidence === bestConfidence && matchLength > bestMatchLength);
    if (wins) {
      bestStrength = strength;
      bestConfidence = rule.confidence;
      bestMatchLength = matchLength;
      best = {
        categoryId: rule.category_id,
        confidence: rule.confidence,
        source: "rule",
        ruleId: rule.id,
        matchLength,
        matchType: rule.match_type,
      };
    }
  }
  return best;
}

/**
 * Cache primeiro; se não bater, regras. Retorna aplicado ou null (skipped).
 */
export function categorizeOne(
  tx: TxInput,
  cacheMap: Map<string, string>,
  rules: CategoryRuleRow[]
): MatchResult | null {
  const fromCache = applyCacheFirst(tx, cacheMap);
  if (fromCache) return fromCache;
  return applyRules(tx, rules);
}

export function shouldAutoApply(confidence: number): boolean {
  return confidence >= AUTO_APPLY_CONFIDENCE;
}
