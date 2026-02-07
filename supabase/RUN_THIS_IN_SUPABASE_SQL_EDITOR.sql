-- ================================================================
-- COMO USAR:
-- 1. Abra o Supabase Dashboard do seu projeto
-- 2. Vá em SQL Editor > New query
-- 3. Cole TODO o conteudo deste arquivo (incluindo os comentarios)
-- 4. Execute (Run)
--
-- Isso aplica as 3 novas migrations sem precisar do db push.
-- Se der erro "policy already exists" em alguma linha, ignore essa linha
-- (pode ser que a policy ja exista).
--
-- Depois disso, para o "db push" nao tentar rodar as 21 antigas de novo,
-- rode no PowerShell (na pasta do projeto, SEM ser admin):
--   .\supabase\repair-migrations.ps1
--   npx supabase db push
-- ================================================================

-- 1) due_date em transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS due_date DATE;
CREATE INDEX IF NOT EXISTS idx_transactions_pending_due
  ON public.transactions (household_id, status, due_date)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transactions_household_date
  ON public.transactions (household_id, transaction_date DESC);

-- 2) credit_cards + installment_groups + colunas em transactions
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_four TEXT,
  card_brand TEXT DEFAULT 'other',
  credit_limit NUMERIC(12,2) DEFAULT 0,
  closing_day INTEGER NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  color TEXT DEFAULT '#6366F1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_cards_household_select" ON public.credit_cards FOR SELECT USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "credit_cards_household_insert" ON public.credit_cards FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "credit_cards_household_update" ON public.credit_cards FOR UPDATE USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "credit_cards_household_delete" ON public.credit_cards FOR DELETE USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.installment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  installment_count INTEGER NOT NULL CHECK (installment_count >= 2),
  start_month DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.installment_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "installment_groups_household_select" ON public.installment_groups FOR SELECT USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "installment_groups_household_insert" ON public.installment_groups FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "installment_groups_household_update" ON public.installment_groups FOR UPDATE USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "installment_groups_household_delete" ON public.installment_groups FOR DELETE USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_group_id UUID REFERENCES public.installment_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_number INTEGER;
CREATE INDEX IF NOT EXISTS idx_credit_cards_household ON public.credit_cards(household_id);
CREATE INDEX IF NOT EXISTS idx_installment_groups_household ON public.installment_groups(household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_card ON public.transactions(credit_card_id) WHERE credit_card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_installment ON public.transactions(installment_group_id) WHERE installment_group_id IS NOT NULL;

-- 3) settlements
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  debtor_user_id UUID NOT NULL REFERENCES auth.users(id),
  creditor_user_id UUID NOT NULL REFERENCES auth.users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  month TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  settled_at TIMESTAMPTZ,
  settled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT different_users CHECK (debtor_user_id <> creditor_user_id)
);
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlements_household_select" ON public.settlements FOR SELECT USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "settlements_household_insert" ON public.settlements FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE POLICY "settlements_household_update" ON public.settlements FOR UPDATE USING (
  household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_settlements_household_month ON public.settlements(household_id, month);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.settlements(status) WHERE status = 'pending';
