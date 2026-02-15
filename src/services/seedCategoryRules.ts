/**
 * Seed de regras de categorização: carrega categorias do banco e popula category_rules
 * com >=100 patterns por categoria (sem duplicar).
 * Rodar uma vez (ex.: pelo Admin ou script com service role).
 */

import { getCategories } from "./categoryRulesService";
import { upsertCategoryRule } from "./categoryRulesService";
import { getAllKits, inferKit, ensureMinPatternsPerKit } from "./categoryRuleKits";
import type { MatchType } from "./categoryRulesService";

const MATCH_TYPE: MatchType = "contains";

export interface SeedCategoryRulesResult {
  categoriesProcessed: number;
  rulesInserted: number;
  errors: string[];
}

/**
 * Popula category_rules com regras globais (family_id NULL) a partir dos kits.
 * Não duplica: upsert por (family_id, category_id, match_type, pattern).
 */
export async function seedCategoryRules(): Promise<SeedCategoryRulesResult> {
  const result: SeedCategoryRulesResult = { categoriesProcessed: 0, rulesInserted: 0, errors: [] };

  ensureMinPatternsPerKit(100);

  const categories = await getCategories();
  if (!categories.length) {
    result.errors.push("Nenhuma categoria encontrada no banco. Execute a migration das tabelas categories e category_rules.");
    return result;
  }

  const kitsBySlug = new Map(getAllKits().map((k) => [k.categoryId, k]));

  for (const cat of categories) {
    const kit = kitsBySlug.get(cat.id) ?? inferKit(cat.name);
    for (const p of kit.patterns) {
      try {
        await upsertCategoryRule({
          family_id: null,
          category_id: kit.categoryId,
          name: p.pattern.slice(0, 200),
          match_type: MATCH_TYPE,
          pattern: p.pattern,
          priority: p.priority,
          confidence: p.confidence,
        });
        result.rulesInserted++;
      } catch (e) {
        result.errors.push(`${cat.id}: ${p.pattern.slice(0, 30)}... - ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    result.categoriesProcessed++;
  }

  return result;
}
