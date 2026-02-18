import { supabase } from "@/integrations/supabase/client";

/** Categoria fixa (bills, food, ...) ou custom (custom:<uuid>). */
export type RuleCategory = string;

export interface CategorizationRule {
  id: string;
  household_id: string;
  created_by: string;
  pattern: string;
  match_type: "contains" | "starts_with" | "exact";
  category: RuleCategory;
  account_id: string | null;
  priority: number;
  is_active: boolean;
  times_applied: number;
  created_at: string;
  updated_at: string;
}

export interface NewCategorizationRule {
  pattern: string;
  match_type?: "contains" | "starts_with" | "exact";
  category: RuleCategory;
  account_id?: string;
  priority?: number;
}

export async function getCategorizationRules(householdId: string): Promise<CategorizationRule[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const { data, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("household_id", householdId)
    .order("priority", { ascending: false });

  if (error) throw error;

  return (data || []).map(rule => ({
    ...rule,
    match_type: rule.match_type as "contains" | "starts_with" | "exact",
    category: rule.category as RuleCategory,
  }));
}

export async function createCategorizationRule(
  householdId: string,
  rule: NewCategorizationRule
): Promise<CategorizationRule> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("categorization_rules")
    .insert({
      household_id: householdId,
      created_by: user.id,
      pattern: rule.pattern.trim(),
      match_type: rule.match_type || "contains",
      category: rule.category,
      account_id: rule.account_id || null,
      priority: rule.priority || 0,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    match_type: data.match_type as "contains" | "starts_with" | "exact",
    category: data.category as RuleCategory,
  };
}

export async function updateCategorizationRule(
  ruleId: string,
  householdId: string,
  updates: Partial<NewCategorizationRule> & { is_active?: boolean }
): Promise<CategorizationRule> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const { data, error } = await supabase
    .from("categorization_rules")
    .update({
      ...updates,
      pattern: updates.pattern?.trim(),
    })
    .eq("id", ruleId)
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    match_type: data.match_type as "contains" | "starts_with" | "exact",
    category: data.category as RuleCategory,
  };
}

export async function deleteCategorizationRule(ruleId: string, householdId: string): Promise<void> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const { error } = await supabase
    .from("categorization_rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", householdId);

  if (error) throw error;
}

// Apply rules to a description and return the matched rule's category
export async function applyCategorizationRules(
  householdId: string,
  description: string
): Promise<{ category: RuleCategory | null; accountId: string | null; ruleId: string | null }> {
  if (!householdId || !description) {
    return { category: null, accountId: null, ruleId: null };
  }

  const { data, error } = await supabase
    .rpc("apply_categorization_rules", {
      _household_id: householdId,
      _description: description,
    });

  if (error) {
    console.error("Error applying categorization rules:", error);
    return { category: null, accountId: null, ruleId: null };
  }

  if (data && data.length > 0) {
    const result = data[0];
    // Increment usage counter in background
    if (result.rule_id) {
      void supabase.rpc("increment_rule_usage", { _rule_id: result.rule_id });
    }
    return {
      category: result.category as RuleCategory,
      accountId: result.account_id,
      ruleId: result.rule_id,
    };
  }

  return { category: null, accountId: null, ruleId: null };
}

/**
 * Suggest rules based on recent "other" (uncategorized) transactions
 * that appear frequently with similar descriptions.
 */
export async function suggestRules(householdId: string): Promise<Array<{
  pattern: string;
  suggestedCategory: RuleCategory;
  occurrences: number;
}>> {
  if (!householdId) return [];

  // Get recent categorized transactions (not "other") to learn patterns
  const { data: categorized } = await supabase
    .from("transactions")
    .select("description, category")
    .eq("household_id", householdId)
    .neq("category", "other")
    .order("created_at", { ascending: false })
    .limit(200);

  // Get existing rules to exclude
  const existingRules = await getCategorizationRules(householdId);
  const existingPatterns = new Set(existingRules.map((r) => r.pattern.toLowerCase()));

  // Build frequency map of description keywords -> category
  const keywordCategoryMap = new Map<string, { category: RuleCategory; count: number }>();

  for (const tx of categorized || []) {
    const words = tx.description.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 4);
    for (const word of words) {
      if (existingPatterns.has(word)) continue;
      const entry = keywordCategoryMap.get(word);
      if (entry) {
        if (entry.category === tx.category) {
          entry.count++;
        }
      } else {
        keywordCategoryMap.set(word, { category: (tx.category ?? "other") as RuleCategory, count: 1 });
      }
    }
  }

  // Filter: only suggest if keyword appeared 3+ times for same category
  const suggestions = Array.from(keywordCategoryMap.entries())
    .filter(([_, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([pattern, v]) => ({
      pattern: pattern.toUpperCase(),
      suggestedCategory: v.category,
      occurrences: v.count,
    }));

  return suggestions;
}

// Create rule from manual correction (learning)
export async function learnFromCorrection(
  householdId: string,
  description: string,
  category: RuleCategory,
  accountId?: string
): Promise<void> {
  // Extract significant keywords from description
  const words = description.split(/\s+/).filter(w => w.length >= 4);
  if (words.length === 0) return;

  // Use the longest word as pattern (usually the most distinctive)
  const pattern = words.reduce((a, b) => a.length > b.length ? a : b).toUpperCase();

  // Check if similar rule already exists
  const existingRules = await getCategorizationRules(householdId);
  const exists = existingRules.some(r => 
    r.pattern.toUpperCase() === pattern && r.category === category
  );

  if (!exists) {
    await createCategorizationRule(householdId, {
      pattern,
      match_type: "contains",
      category,
      account_id: accountId,
      priority: 0,
    });
  }
}
