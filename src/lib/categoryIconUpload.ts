import { supabase } from "@/integrations/supabase/client";

const BUCKET = "category-icons";
const MAX_SIZE_BYTES = 200_000;
const ALLOWED_TYPES = ["image/png", "image/webp", "image/svg+xml"];

/**
 * Faz upload do ícone da categoria para Storage.
 * Path: {householdId}/{categoryId}.{ext}
 * Retorna a URL pública.
 */
export async function uploadCategoryIcon(
  householdId: string,
  categoryId: string,
  file: File
): Promise<string> {
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error("Imagem deve ter no máximo 200 KB.");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Use PNG, WebP ou SVG.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "webp", "svg"].includes(ext) ? ext : "png";
  const path = `${householdId}/${categoryId}.${safeExt}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${publicUrl}?t=${Date.now()}`;
}
