import { supabase } from "@/integrations/supabase/client";

export type IconType = "preset" | "upload" | null;

export interface HouseholdCategory {
  id: string;
  household_id: string;
  name: string;
  slug: string | null;
  color: string | null;
  icon: string | null;
  icon_type?: IconType | null;
  icon_key?: string | null;
  icon_url?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateHouseholdCategoryInput = {
  name: string;
  color?: string | null;
  slug?: string | null;
  icon_type?: IconType;
  icon_key?: string | null;
  icon_url?: string | null;
};

export type UpdateHouseholdCategoryInput = Partial<CreateHouseholdCategoryInput> & { is_archived?: boolean };

export class CategoryInUseError extends Error {
  constructor(
    message: string,
    public usageCount: { transactions: number; rules: number }
  ) {
    super(message);
    this.name = "CategoryInUseError";
  }
}

const NAME_MAX_LEN = 32;

function trimName(name: string): string {
  return name.trim().slice(0, NAME_MAX_LEN);
}

/** Lista categorias da família (ativas por padrão; incluir arquivadas se includeArchived) */
export async function getHouseholdCategories(
  householdId: string,
  options?: { includeArchived?: boolean }
): Promise<HouseholdCategory[]> {
  if (!householdId) return [];
  let query = supabase
    .from("household_categories")
    .select("*")
    .eq("household_id", householdId)
    .order("name", { ascending: true });
  if (!options?.includeArchived) {
    query = query.eq("is_archived", false);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as HouseholdCategory[];
}

function normalizeIconInput(input: {
  icon_type?: IconType;
  icon_key?: string | null;
  icon_url?: string | null;
}): { icon_type: IconType; icon_key: string | null; icon_url: string | null } {
  const type = input.icon_type ?? null;
  if (type === "preset") {
    if (!input.icon_key?.trim()) throw new Error("Ícone predefinido requer icon_key.");
    return { icon_type: "preset", icon_key: input.icon_key.trim(), icon_url: null };
  }
  if (type === "upload") {
    if (!input.icon_url?.trim()) throw new Error("Ícone por upload requer icon_url.");
    return { icon_type: "upload", icon_key: null, icon_url: input.icon_url.trim() };
  }
  return { icon_type: null, icon_key: null, icon_url: null };
}

/** Cria categoria extra. Nome obrigatório, único (case-insensitive) por família. */
export async function createHouseholdCategory(
  householdId: string,
  input: CreateHouseholdCategoryInput
): Promise<HouseholdCategory> {
  const name = trimName(input.name);
  if (!name) throw new Error("Nome da categoria é obrigatório.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const icon = normalizeIconInput(input);
  const { data, error } = await supabase
    .from("household_categories")
    .insert({
      household_id: householdId,
      name,
      slug: input.slug ?? name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      color: input.color ?? null,
      icon_type: icon.icon_type,
      icon_key: icon.icon_key,
      icon_url: icon.icon_url,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Já existe uma categoria com esse nome nesta família.");
    throw error;
  }
  return data as HouseholdCategory;
}

/** Atualiza categoria (nome, cor, ícone ou is_archived). */
export async function updateHouseholdCategory(
  householdId: string,
  id: string,
  input: UpdateHouseholdCategoryInput
): Promise<HouseholdCategory> {
  if (!householdId || !id) throw new Error("householdId e id são obrigatórios.");
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = trimName(input.name);
    if (!name) throw new Error("Nome não pode ficar vazio.");
    updates.name = name;
  }
  if (input.color !== undefined) updates.color = input.color;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.is_archived !== undefined) updates.is_archived = input.is_archived;
  if (input.icon_type !== undefined || input.icon_key !== undefined || input.icon_url !== undefined) {
    const icon = normalizeIconInput({
      icon_type: input.icon_type,
      icon_key: input.icon_key,
      icon_url: input.icon_url,
    });
    updates.icon_type = icon.icon_type;
    updates.icon_key = icon.icon_key;
    updates.icon_url = icon.icon_url;
  }
  if (Object.keys(updates).length === 0) {
    const list = await getHouseholdCategories(householdId, { includeArchived: true });
    const existing = list.find((c) => c.id === id);
    if (!existing) throw new Error("Categoria não encontrada.");
    return existing;
  }
  const { data, error } = await supabase
    .from("household_categories")
    .update(updates)
    .eq("id", id)
    .eq("household_id", householdId)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Já existe uma categoria com esse nome nesta família.");
    throw error;
  }
  return data as HouseholdCategory;
}

/** Arquiva categoria (transações antigas continuam com custom:<id>; exibir como “(Arquivada) Nome”). */
export async function archiveHouseholdCategory(householdId: string, id: string): Promise<void> {
  await updateHouseholdCategory(householdId, id, { is_archived: true });
}

/** Valor de categoria em transactions: fixo (CategoryType) ou custom:<uuid> */
export const CUSTOM_CATEGORY_PREFIX = "custom:";

export function isCustomCategory(category: string): boolean {
  return category.startsWith(CUSTOM_CATEGORY_PREFIX);
}

export function customCategoryId(category: string): string | null {
  if (!isCustomCategory(category)) return null;
  return category.slice(CUSTOM_CATEGORY_PREFIX.length);
}

export function toCustomCategoryValue(id: string): string {
  return `${CUSTOM_CATEGORY_PREFIX}${id}`;
}

/** Verifica quantas transações e regras usam esta categoria. */
export async function getCategoryUsage(
  householdId: string,
  categoryId: string
): Promise<{ transactions: number; rules: number }> {
  const value = `${CUSTOM_CATEGORY_PREFIX}${categoryId}`;
  const [txRes, rulesRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("category", value),
    supabase
      .from("categorization_rules")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("category", value),
  ]);
  return {
    transactions: txRes.count ?? 0,
    rules: rulesRes.count ?? 0,
  };
}

/** Exclui permanentemente a categoria. Falha com CategoryInUseError (409) se houver transações ou regras usando. */
export async function deleteHouseholdCategoryPermanently(
  householdId: string,
  id: string
): Promise<void> {
  const usage = await getCategoryUsage(householdId, id);
  if (usage.transactions > 0 || usage.rules > 0) {
    throw new CategoryInUseError(
      "Categoria em uso; arquive em vez de apagar ou use Reatribuir e excluir.",
      usage
    );
  }
  const { error } = await supabase
    .from("household_categories")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);
  if (error) throw error;
}

/** Reatribui transações e regras que usam esta categoria para outra e depois exclui a categoria. */
export async function reassignAndDeleteHouseholdCategory(
  householdId: string,
  id: string,
  targetCategory: string
): Promise<void> {
  const value = `${CUSTOM_CATEGORY_PREFIX}${id}`;
  const { error: txErr } = await supabase
    .from("transactions")
    .update({ category: targetCategory })
    .eq("household_id", householdId)
    .eq("category", value);
  if (txErr) throw txErr;
  const { error: rulesErr } = await supabase
    .from("categorization_rules")
    .update({ category: targetCategory })
    .eq("household_id", householdId)
    .eq("category", value);
  if (rulesErr) throw rulesErr;
  const { error: delErr } = await supabase
    .from("household_categories")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);
  if (delErr) throw delErr;
}
