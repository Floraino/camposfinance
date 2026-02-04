-- Enum para tipos de plano
CREATE TYPE public.plan_type AS ENUM ('BASIC', 'PRO');

-- Enum para status do plano
CREATE TYPE public.plan_status AS ENUM ('active', 'cancelled', 'expired', 'trial');

-- Enum para papel do membro na família
CREATE TYPE public.household_role AS ENUM ('owner', 'admin', 'member');

-- Tabela de Famílias (Households)
CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Planos da Família
CREATE TABLE public.household_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  plan plan_type NOT NULL DEFAULT 'BASIC',
  status plan_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(household_id)
);

-- Tabela de Membros da Família
CREATE TABLE public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role household_role NOT NULL DEFAULT 'member',
  invited_by UUID,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(household_id, user_id)
);

-- Tabela de Contas Bancárias/Carteiras (ligadas à família)
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checking',
  balance NUMERIC NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6366F1',
  icon TEXT DEFAULT 'wallet',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adicionar household_id e account_id às transações
ALTER TABLE public.transactions 
ADD COLUMN household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
ADD COLUMN account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Adicionar coluna para anexos de imagem
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS attachments TEXT[];

-- Função para verificar se usuário é membro de uma família
CREATE OR REPLACE FUNCTION public.is_household_member(_user_id UUID, _household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id AND household_id = _household_id
  )
$$;

-- Função para verificar se usuário é owner/admin da família
CREATE OR REPLACE FUNCTION public.is_household_admin(_user_id UUID, _household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id 
    AND household_id = _household_id
    AND role IN ('owner', 'admin')
  )
$$;

-- Função para obter o plano de uma família
CREATE OR REPLACE FUNCTION public.get_household_plan(_household_id UUID)
RETURNS plan_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT plan FROM public.household_plans 
     WHERE household_id = _household_id 
     AND status = 'active'),
    'BASIC'::plan_type
  )
$$;

-- Função para contar contas de uma família
CREATE OR REPLACE FUNCTION public.count_household_accounts(_household_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.accounts
  WHERE household_id = _household_id AND is_active = true
$$;

-- Função para verificar se pode criar conta (limite BASIC = 2)
CREATE OR REPLACE FUNCTION public.can_create_account(_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.get_household_plan(_household_id) = 'PRO' THEN true
    ELSE public.count_household_accounts(_household_id) < 2
  END
$$;

-- Função para verificar se pode usar OCR (somente PRO)
CREATE OR REPLACE FUNCTION public.can_use_ocr(_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_household_plan(_household_id) = 'PRO'
$$;

-- Enable RLS
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies para households
CREATE POLICY "Members can view their households"
ON public.households FOR SELECT
USING (public.is_household_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create households"
ON public.households FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update their households"
ON public.households FOR UPDATE
USING (public.is_household_admin(auth.uid(), id));

CREATE POLICY "Owner can delete household"
ON public.households FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.household_members
  WHERE user_id = auth.uid() AND household_id = id AND role = 'owner'
));

-- RLS Policies para household_plans
CREATE POLICY "Members can view their household plan"
ON public.household_plans FOR SELECT
USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can manage household plan"
ON public.household_plans FOR INSERT
WITH CHECK (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "Admins can update household plan"
ON public.household_plans FOR UPDATE
USING (public.is_household_admin(auth.uid(), household_id));

-- RLS Policies para household_members
CREATE POLICY "Members can view household members"
ON public.household_members FOR SELECT
USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can add members"
ON public.household_members FOR INSERT
WITH CHECK (
  public.is_household_admin(auth.uid(), household_id)
  OR (auth.uid() = user_id AND NOT EXISTS (
    SELECT 1 FROM public.household_members WHERE household_id = household_members.household_id
  ))
);

CREATE POLICY "Admins can update members"
ON public.household_members FOR UPDATE
USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "Admins can remove members"
ON public.household_members FOR DELETE
USING (public.is_household_admin(auth.uid(), household_id) OR auth.uid() = user_id);

-- RLS Policies para accounts
CREATE POLICY "Members can view household accounts"
ON public.accounts FOR SELECT
USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can create accounts if allowed"
ON public.accounts FOR INSERT
WITH CHECK (
  public.is_household_member(auth.uid(), household_id)
  AND public.can_create_account(household_id)
);

CREATE POLICY "Members can update household accounts"
ON public.accounts FOR UPDATE
USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Admins can delete accounts"
ON public.accounts FOR DELETE
USING (public.is_household_admin(auth.uid(), household_id));

-- Triggers para updated_at
CREATE TRIGGER update_households_updated_at
BEFORE UPDATE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_household_plans_updated_at
BEFORE UPDATE ON public.household_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_household_members_updated_at
BEFORE UPDATE ON public.household_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();