-- ================================================================
-- Feature 5: Settlements ("Acertos") ledger
-- ================================================================

CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  debtor_user_id UUID NOT NULL REFERENCES auth.users(id),
  creditor_user_id UUID NOT NULL REFERENCES auth.users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  month TEXT NOT NULL, -- YYYY-MM (period reference)
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  settled_at TIMESTAMPTZ,
  settled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT different_users CHECK (debtor_user_id <> creditor_user_id)
);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements_household_select" ON public.settlements
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "settlements_household_insert" ON public.settlements
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "settlements_household_update" ON public.settlements
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_settlements_household_month ON public.settlements(household_id, month);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.settlements(status) WHERE status = 'pending';
