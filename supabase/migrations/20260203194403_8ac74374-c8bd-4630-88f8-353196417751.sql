-- Drop existing restrictive RLS policies on transactions
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;

-- Create new family-shared policies - all authenticated users can see all transactions
CREATE POLICY "Family members can view all transactions" 
ON public.transactions 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Family members can insert transactions" 
ON public.transactions 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Family members can update transactions" 
ON public.transactions 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Family members can delete transactions" 
ON public.transactions 
FOR DELETE 
TO authenticated
USING (true);