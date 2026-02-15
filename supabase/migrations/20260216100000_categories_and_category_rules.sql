-- ============================================
-- Categorias do motor de regras (bills, food, ...) — tabela separada da categories (user/household)
-- ============================================
CREATE TABLE IF NOT EXISTS public.categorization_categories (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed categorias existentes no app (CategoryBadge)
INSERT INTO public.categorization_categories (id, name) VALUES
  ('bills', 'Contas Fixas'),
  ('food', 'Alimentação'),
  ('leisure', 'Lazer'),
  ('shopping', 'Compras'),
  ('transport', 'Transporte'),
  ('health', 'Saúde'),
  ('education', 'Educação'),
  ('other', 'Outros')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.categorization_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view categorization_categories"
  ON public.categorization_categories FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- Regras de categorização (determinísticas, sem IA)
-- ============================================
CREATE TABLE IF NOT EXISTS public.category_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES public.categorization_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'regex', 'startsWith', 'equals')),
  pattern TEXT NOT NULL,
  flags TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.85 CHECK (confidence >= 0 AND confidence <= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (family_id, category_id, match_type, pattern)
);

CREATE INDEX idx_category_rules_family_category ON public.category_rules(family_id, category_id);
CREATE INDEX idx_category_rules_family_active_priority ON public.category_rules(family_id, is_active, priority DESC);
CREATE INDEX idx_category_rules_category ON public.category_rules(category_id);

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view category rules (global or own family)"
  ON public.category_rules FOR SELECT
  USING (
    family_id IS NULL
    OR public.is_household_member(auth.uid(), family_id)
  );

CREATE POLICY "Admins can insert category rules for their family"
  ON public.category_rules FOR INSERT
  WITH CHECK (
    (family_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (family_id IS NOT NULL AND public.is_household_member(auth.uid(), family_id))
  );

CREATE POLICY "Admins can update category rules"
  ON public.category_rules FOR UPDATE
  USING (
    (family_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (family_id IS NOT NULL AND public.is_household_member(auth.uid(), family_id))
  );

CREATE POLICY "Admins can delete category rules"
  ON public.category_rules FOR DELETE
  USING (
    (family_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (family_id IS NOT NULL AND public.is_household_member(auth.uid(), family_id))
  );

COMMENT ON TABLE public.category_rules IS 'Regras determinísticas de categorização (sem IA); family_id NULL = regras globais.';
