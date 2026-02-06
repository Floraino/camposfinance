-- ================================================================
-- Feature 3: Credit Cards  +  Feature 4: Installments
-- ================================================================

-- Credit cards per household
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Nubank", "Itaú Platinum"
  last_four TEXT,                        -- "1234"
  card_brand TEXT DEFAULT 'other',       -- visa, mastercard, elo, other
  credit_limit NUMERIC(12,2) DEFAULT 0,
  closing_day INTEGER NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  color TEXT DEFAULT '#6366F1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_cards_household_select" ON public.credit_cards
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "credit_cards_household_insert" ON public.credit_cards
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "credit_cards_household_update" ON public.credit_cards
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "credit_cards_household_delete" ON public.credit_cards
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

-- Installment groups (tracks a single purchase split into N installments)
CREATE TABLE IF NOT EXISTS public.installment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  installment_count INTEGER NOT NULL CHECK (installment_count >= 2),
  start_month DATE NOT NULL,                -- first installment month (YYYY-MM-01)
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installment_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "installment_groups_household_select" ON public.installment_groups
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "installment_groups_household_insert" ON public.installment_groups
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "installment_groups_household_update" ON public.installment_groups
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "installment_groups_household_delete" ON public.installment_groups
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

-- Add credit card + installment references to transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_group_id UUID REFERENCES public.installment_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_number INTEGER; -- 1, 2, 3... (null if not installment)

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_cards_household ON public.credit_cards(household_id);
CREATE INDEX IF NOT EXISTS idx_installment_groups_household ON public.installment_groups(household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_card ON public.transactions(credit_card_id) WHERE credit_card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_installment ON public.transactions(installment_group_id) WHERE installment_group_id IS NOT NULL;
