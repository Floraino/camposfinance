-- Super admin DELETE policies for households
CREATE POLICY "Super admins can delete households"
ON public.households
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admin UPDATE policy for households
CREATE POLICY "Super admins can update all households"
ON public.households
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Super admin DELETE policy for profiles
CREATE POLICY "Super admins can delete profiles"
ON public.profiles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admin DELETE/UPDATE policies for household_members
CREATE POLICY "Super admins can delete all members"
ON public.household_members
FOR DELETE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all members"
ON public.household_members
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Super admin DELETE policy for household_plans
CREATE POLICY "Super admins can delete all plans"
ON public.household_plans
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admin DELETE/UPDATE policies for transactions
CREATE POLICY "Super admins can delete all transactions"
ON public.transactions
FOR DELETE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all transactions"
ON public.transactions
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Super admin DELETE/UPDATE policies for accounts
CREATE POLICY "Super admins can delete all accounts"
ON public.accounts
FOR DELETE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all accounts"
ON public.accounts
FOR UPDATE
USING (is_super_admin(auth.uid()));