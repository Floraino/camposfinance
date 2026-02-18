-- ============================================
-- Categorias personalizadas por família (extras)
-- transactions.category pode ser enum fixo (bills, food, ...) ou 'custom:<uuid>'
-- ============================================
CREATE TABLE IF NOT EXISTS public.household_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  color TEXT,
  icon TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT household_categories_name_trim CHECK (trim(name) = name AND length(trim(name)) >= 1),
  CONSTRAINT household_categories_name_len CHECK (char_length(name) <= 32)
);

CREATE UNIQUE INDEX idx_household_categories_household_name_lower
  ON public.household_categories (household_id, lower(trim(name)))
  WHERE is_archived = false;

CREATE INDEX idx_household_categories_household ON public.household_categories(household_id);
CREATE INDEX idx_household_categories_household_active ON public.household_categories(household_id) WHERE is_archived = false;

COMMENT ON TABLE public.household_categories IS 'Categorias extras por família; em transactions.category usar custom:<id> para referenciar.';

ALTER TABLE public.household_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their household categories"
  ON public.household_categories FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can insert household categories"
  ON public.household_categories FOR INSERT
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can update their household categories"
  ON public.household_categories FOR UPDATE
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can delete their household categories"
  ON public.household_categories FOR DELETE
  USING (public.is_household_member(auth.uid(), household_id));

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.set_updated_at_household_categories()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_household_categories_updated_at ON public.household_categories;
CREATE TRIGGER trigger_household_categories_updated_at
  BEFORE UPDATE ON public.household_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_household_categories();
