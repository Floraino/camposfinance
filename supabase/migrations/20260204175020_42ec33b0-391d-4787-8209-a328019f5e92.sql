-- ============================================
-- FASE 1: Regras de Categorização Automática + Metas por Categoria
-- ============================================

-- 1) Tabela: categorization_rules (Regras automáticas)
CREATE TABLE public.categorization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  pattern TEXT NOT NULL, -- Pattern to match (e.g., "UBER", "IFOOD")
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'starts_with', 'exact')),
  category TEXT NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0, -- Higher = more priority
  is_active BOOLEAN NOT NULL DEFAULT true,
  times_applied INTEGER NOT NULL DEFAULT 0, -- How many times this rule was used
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_categorization_rules_household ON public.categorization_rules(household_id);
CREATE INDEX idx_categorization_rules_pattern ON public.categorization_rules(pattern, is_active);

-- RLS for categorization_rules
ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their household rules"
  ON public.categorization_rules FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can create rules"
  ON public.categorization_rules FOR INSERT
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can update rules"
  ON public.categorization_rules FOR UPDATE
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can delete rules"
  ON public.categorization_rules FOR DELETE
  USING (public.is_household_admin(auth.uid(), household_id));

-- 2) Tabela: category_budgets (Metas por Categoria)
CREATE TABLE public.category_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  alert_threshold INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold > 0 AND alert_threshold <= 100),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(household_id, category, month, year)
);

-- Index for fast lookup
CREATE INDEX idx_category_budgets_household ON public.category_budgets(household_id, month, year);

-- RLS for category_budgets
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their household category budgets"
  ON public.category_budgets FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can create category budgets"
  ON public.category_budgets FOR INSERT
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can update category budgets"
  ON public.category_budgets FOR UPDATE
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can delete category budgets"
  ON public.category_budgets FOR DELETE
  USING (public.is_household_admin(auth.uid(), household_id));

-- 3) Função: apply_categorization_rules (Aplica regras em uma descrição)
CREATE OR REPLACE FUNCTION public.apply_categorization_rules(_household_id UUID, _description TEXT)
RETURNS TABLE(category TEXT, account_id UUID, rule_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.category,
    r.account_id,
    r.id AS rule_id
  FROM public.categorization_rules r
  WHERE r.household_id = _household_id
    AND r.is_active = true
    AND (
      (r.match_type = 'contains' AND UPPER(_description) LIKE '%' || UPPER(r.pattern) || '%')
      OR (r.match_type = 'starts_with' AND UPPER(_description) LIKE UPPER(r.pattern) || '%')
      OR (r.match_type = 'exact' AND UPPER(_description) = UPPER(r.pattern))
    )
  ORDER BY r.priority DESC, r.times_applied DESC
  LIMIT 1;
END;
$$;

-- 4) Função: increment_rule_usage (Incrementa contador de uso)
CREATE OR REPLACE FUNCTION public.increment_rule_usage(_rule_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.categorization_rules
  SET times_applied = times_applied + 1, updated_at = now()
  WHERE id = _rule_id;
END;
$$;

-- 5) Função: get_category_spending (Gasto por categoria no mês)
CREATE OR REPLACE FUNCTION public.get_category_spending(_household_id UUID, _month INTEGER, _year INTEGER)
RETURNS TABLE(category TEXT, total_spent NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    t.category,
    COALESCE(SUM(ABS(t.amount)), 0) AS total_spent
  FROM public.transactions t
  WHERE t.household_id = _household_id
    AND EXTRACT(MONTH FROM t.transaction_date::date) = _month
    AND EXTRACT(YEAR FROM t.transaction_date::date) = _year
    AND t.amount < 0 -- Only expenses
  GROUP BY t.category;
$$;

-- 6) Trigger para atualizar updated_at
CREATE TRIGGER update_categorization_rules_updated_at
  BEFORE UPDATE ON public.categorization_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_category_budgets_updated_at
  BEFORE UPDATE ON public.category_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();