-- =====================================================
-- FIX: Criação atômica de famílias (household + member + plan)
-- =====================================================

-- Função para criar household de forma atômica (owner + member + plan)
CREATE OR REPLACE FUNCTION public.create_household_with_owner(_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_id UUID;
  new_household_id UUID;
  result_household RECORD;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Criar household
  INSERT INTO public.households (name, created_by)
  VALUES (_name, user_id)
  RETURNING id INTO new_household_id;

  -- Adicionar owner como membro
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (new_household_id, user_id, 'owner');

  -- Criar plano BASIC
  INSERT INTO public.household_plans (household_id, plan, status)
  VALUES (new_household_id, 'BASIC', 'active');

  -- Retornar household criado
  SELECT * INTO result_household
  FROM public.households
  WHERE id = new_household_id;

  RETURN json_build_object(
    'success', true,
    'household', json_build_object(
      'id', result_household.id,
      'name', result_household.name,
      'created_by', result_household.created_by,
      'created_at', result_household.created_at,
      'updated_at', result_household.updated_at
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =====================================================
-- FIX: Adicionar household_id à tabela budgets
-- =====================================================

-- Adicionar coluna household_id
ALTER TABLE public.budgets 
ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_budgets_household_id ON public.budgets(household_id);

-- =====================================================
-- FIX: Atualizar RLS policies de budgets para usar household
-- =====================================================

-- Remover policies antigas de budgets
DROP POLICY IF EXISTS "Users can view their own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can insert their own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can update their own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can delete their own budgets" ON public.budgets;

-- Criar novas policies baseadas em household
CREATE POLICY "Members can view household budgets" 
ON public.budgets 
FOR SELECT 
USING (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can insert household budgets" 
ON public.budgets 
FOR INSERT 
WITH CHECK (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can update household budgets" 
ON public.budgets 
FOR UPDATE 
USING (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Admins can delete household budgets" 
ON public.budgets 
FOR DELETE 
USING (
  household_id IS NOT NULL AND is_household_admin(auth.uid(), household_id)
);

-- =====================================================
-- FIX: Garantir que transactions SEMPRE tenha household_id (NOT NULL)
-- =====================================================

-- Atualizar RLS policies de transactions para exigir household_id
DROP POLICY IF EXISTS "Members can view household transactions" ON public.transactions;
DROP POLICY IF EXISTS "Members can create transactions in household" ON public.transactions;
DROP POLICY IF EXISTS "Members can update household transactions" ON public.transactions;
DROP POLICY IF EXISTS "Members can delete household transactions" ON public.transactions;

CREATE POLICY "Members can view household transactions" 
ON public.transactions 
FOR SELECT 
USING (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can create transactions in household" 
ON public.transactions 
FOR INSERT 
WITH CHECK (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can update household transactions" 
ON public.transactions 
FOR UPDATE 
USING (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can delete household transactions" 
ON public.transactions 
FOR DELETE 
USING (
  household_id IS NOT NULL AND is_household_admin(auth.uid(), household_id)
);

-- Manter policy de super admin
DROP POLICY IF EXISTS "Super admins can view all transactions" ON public.transactions;
CREATE POLICY "Super admins can view all transactions" 
ON public.transactions 
FOR SELECT 
USING (is_super_admin(auth.uid()));

-- =====================================================
-- FIX: Adicionar household_id à tabela categories (para categorias customizadas por família)
-- =====================================================

ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_household_id ON public.categories(household_id);

-- Atualizar RLS policies de categories
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can insert their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categories;

CREATE POLICY "Members can view household categories" 
ON public.categories 
FOR SELECT 
USING (
  (is_system = true) OR (household_id IS NOT NULL AND is_household_member(auth.uid(), household_id))
);

CREATE POLICY "Members can insert household categories" 
ON public.categories 
FOR INSERT 
WITH CHECK (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Members can update household categories" 
ON public.categories 
FOR UPDATE 
USING (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id) AND is_system = false
);

CREATE POLICY "Admins can delete household categories" 
ON public.categories 
FOR DELETE 
USING (
  household_id IS NOT NULL AND is_household_admin(auth.uid(), household_id) AND is_system = false
);

-- =====================================================
-- FIX: Atualizar family_members para usar household_id em vez de household_owner_id
-- =====================================================

-- Adicionar household_id à tabela family_members
ALTER TABLE public.family_members 
ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_family_members_household_id ON public.family_members(household_id);

-- Atualizar RLS policies de family_members para usar household_id
DROP POLICY IF EXISTS "Users can view their household members" ON public.family_members;
DROP POLICY IF EXISTS "Users can add household members" ON public.family_members;
DROP POLICY IF EXISTS "Users can update their household members" ON public.family_members;
DROP POLICY IF EXISTS "Users can delete their household members" ON public.family_members;

CREATE POLICY "Members can view family members" 
ON public.family_members 
FOR SELECT 
USING (
  household_id IS NOT NULL AND is_household_member(auth.uid(), household_id)
);

CREATE POLICY "Admins can add family members" 
ON public.family_members 
FOR INSERT 
WITH CHECK (
  household_id IS NOT NULL AND is_household_admin(auth.uid(), household_id)
);

CREATE POLICY "Admins can update family members" 
ON public.family_members 
FOR UPDATE 
USING (
  household_id IS NOT NULL AND is_household_admin(auth.uid(), household_id)
);

CREATE POLICY "Admins can delete family members" 
ON public.family_members 
FOR DELETE 
USING (
  household_id IS NOT NULL AND is_household_admin(auth.uid(), household_id)
);