-- ============================================
-- Categorias personalizadas: ícones (preset/upload) e suporte a exclusão permanente
-- ============================================

-- Novos campos de ícone
ALTER TABLE public.household_categories
  ADD COLUMN IF NOT EXISTS icon_type TEXT,
  ADD COLUMN IF NOT EXISTS icon_key TEXT,
  ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- Constraint: preset => icon_key not null, upload => icon_url not null
ALTER TABLE public.household_categories
  DROP CONSTRAINT IF EXISTS household_categories_icon_type_check;

ALTER TABLE public.household_categories
  ADD CONSTRAINT household_categories_icon_type_check CHECK (
    (icon_type IS NULL AND icon_key IS NULL AND icon_url IS NULL)
    OR (icon_type = 'preset' AND icon_key IS NOT NULL AND icon_url IS NULL)
    OR (icon_type = 'upload' AND icon_url IS NOT NULL AND icon_key IS NULL)
  );

COMMENT ON COLUMN public.household_categories.icon_type IS 'preset = ícone do catálogo (icon_key); upload = imagem (icon_url)';
COMMENT ON COLUMN public.household_categories.icon_key IS 'Chave do ícone predefinido (ex: paw, gift). Usado quando icon_type = preset';
COMMENT ON COLUMN public.household_categories.icon_url IS 'URL da imagem (storage). Usado quando icon_type = upload';

-- Bucket para ícones de categoria (upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'category-icons',
  'category-icons',
  true,
  200000,
  ARRAY['image/png', 'image/webp', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: apenas membros do household podem ler/escrever no path do seu household
CREATE POLICY "Household members can view category icons"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-icons');

CREATE POLICY "Household members can upload category icons"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'category-icons'
    AND public.is_household_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Household members can update category icons"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'category-icons'
    AND public.is_household_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Household members can delete category icons"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'category-icons'
    AND public.is_household_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
