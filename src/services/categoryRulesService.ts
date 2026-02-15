import { supabase } from "@/integrations/supabase/client";

export type MatchType = "contains" | "regex" | "startsWith" | "equals";

export interface CategoryRuleRow {
  id: string;
  family_id: string | null;
  category_id: string;
  name: string;
  match_type: MatchType;
  pattern: string;
  flags: string | null;
  priority: number;
  confidence: number;
  is_active: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * Busca categorias existentes no app (tabela categories).
 */
export async function getCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from("categories").select("id, name, slug").order("id");
  if (error) {
    console.warn("[categoryRulesService] getCategories error:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Regras globais (family_id NULL) + regras da família, ordenadas por priority desc.
 */
export async function getCategoryRulesForFamily(familyId: string | null): Promise<CategoryRuleRow[]> {
  if (!familyId) {
    const { data, error } = await supabase
      .from("category_rules")
      .select("*")
      .is("family_id", null)
      .eq("is_active", true)
      .order("priority", { ascending: false });
    if (error) {
      console.warn("[categoryRulesService] getCategoryRules (global) error:", error.message);
      return [];
    }
    return (data || []) as CategoryRuleRow[];
  }
  const { data, error } = await supabase
    .from("category_rules")
    .select("*")
    .or(`family_id.is.null,family_id.eq.${familyId}`)
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) {
    console.warn("[categoryRulesService] getCategoryRulesForFamily error:", error.message);
    return [];
  }
  return (data || []) as CategoryRuleRow[];
}

/**
 * Insere regra (upsert por family_id + category_id + match_type + pattern para não duplicar).
 */
export async function upsertCategoryRule(rule: {
  family_id: string | null;
  category_id: string;
  name: string;
  match_type: MatchType;
  pattern: string;
  flags?: string | null;
  priority: number;
  confidence: number;
}): Promise<void> {
  const { error } = await supabase.from("category_rules").upsert(
    {
      family_id: rule.family_id,
      category_id: rule.category_id,
      name: rule.name,
      match_type: rule.match_type,
      pattern: rule.pattern.trim(),
      flags: rule.flags ?? null,
      priority: rule.priority,
      confidence: rule.confidence,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "family_id,category_id,match_type,pattern",
      ignoreDuplicates: false,
    }
  );
  if (error) throw error;
}
