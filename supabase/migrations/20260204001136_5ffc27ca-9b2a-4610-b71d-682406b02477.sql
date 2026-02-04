-- Remover políticas antigas de transactions
DROP POLICY IF EXISTS "Family members can delete transactions" ON public.transactions;
DROP POLICY IF EXISTS "Family members can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Family members can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Family members can view all transactions" ON public.transactions;

-- Criar novas políticas baseadas em household
CREATE POLICY "Members can view household transactions"
ON public.transactions FOR SELECT
USING (
  household_id IS NULL 
  OR public.is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can create transactions in household"
ON public.transactions FOR INSERT
WITH CHECK (
  household_id IS NULL 
  OR public.is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can update household transactions"
ON public.transactions FOR UPDATE
USING (
  household_id IS NULL 
  OR public.is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can delete household transactions"
ON public.transactions FOR DELETE
USING (
  household_id IS NULL 
  OR public.is_household_member(auth.uid(), household_id)
);