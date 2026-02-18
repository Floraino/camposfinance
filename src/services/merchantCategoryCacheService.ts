import { supabase } from "@/integrations/supabase/client";

/**
 * Cache: fingerprint -> category por household.
 * category pode ser fixa (bills, food, ...) ou custom (custom:<uuid>).
 */
export async function getCacheByFingerprints(
  householdId: string,
  fingerprints: string[]
): Promise<Map<string, string>> {
  if (!householdId || fingerprints.length === 0) return new Map();
  const unique = [...new Set(fingerprints)];

  const { data, error } = await supabase
    .from("merchant_category_cache")
    .select("fingerprint, category")
    .eq("household_id", householdId)
    .in("fingerprint", unique);

  if (error) {
    console.warn("[merchantCategoryCache] getCacheByFingerprints error:", error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data || []) {
    if (row.category) map.set(row.fingerprint, row.category);
  }
  return map;
}

export async function setCache(
  householdId: string,
  fingerprint: string,
  category: string,
  confidence: number = 1.0
): Promise<void> {
  if (!householdId || !fingerprint) return;

  const { error } = await supabase
    .from("merchant_category_cache")
    .upsert(
      {
        household_id: householdId,
        fingerprint,
        category,
        confidence,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "household_id,fingerprint" }
    );

  if (error) {
    console.warn("[merchantCategoryCache] setCache error:", error.message);
  }
}

export async function setCacheBatch(
  householdId: string,
  entries: Array<{ fingerprint: string; category: string; confidence?: number }>
): Promise<void> {
  if (!householdId || entries.length === 0) return;
  const now = new Date().toISOString();
  const rows = entries.map((e) => ({
    household_id: householdId,
    fingerprint: e.fingerprint,
    category: e.category,
    confidence: e.confidence ?? 1.0,
    last_used_at: now,
    source: "rule",
    hits: 1,
  }));

  const { error } = await supabase.from("merchant_category_cache").upsert(rows, {
    onConflict: "household_id,fingerprint",
  });

  if (error) {
    console.warn("[merchantCategoryCache] setCacheBatch error:", error.message);
  }
}

/** Marca cache como usado por regra e incrementa hits (para categorização local). */
export async function setCacheFromRule(
  householdId: string,
  fingerprint: string,
  category: string
): Promise<void> {
  if (!householdId || !fingerprint) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("merchant_category_cache").upsert(
    {
      household_id: householdId,
      fingerprint,
      category,
      confidence: 0.95,
      last_used_at: now,
      source: "rule",
      hits: 1,
      updated_at: now,
    },
    { onConflict: "household_id,fingerprint" }
  );
  if (error) {
    console.warn("[merchantCategoryCache] setCacheFromRule error:", error.message);
  }
}
