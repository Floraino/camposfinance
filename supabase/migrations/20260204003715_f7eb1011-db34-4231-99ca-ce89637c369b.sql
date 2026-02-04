-- 1. Create app_role enum for global roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'user');

-- 2. Create user_roles table (following security best practices - roles in separate table)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check if user has a role (prevents recursion)
CREATE OR REPLACE FUNCTION public.has_app_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_app_role(_user_id, 'super_admin')
$$;

-- 5. RLS policies for user_roles
CREATE POLICY "Super admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage roles"
ON public.user_roles FOR ALL
USING (public.is_super_admin(auth.uid()));

-- 6. Add source and pro_expires_at to household_plans
ALTER TABLE public.household_plans 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'subscription' CHECK (source IN ('subscription', 'coupon', 'admin_grant', 'trial')),
ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMP WITH TIME ZONE;

-- 7. Create coupons table
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'days_pro' CHECK (type IN ('days_pro')),
  days_granted INTEGER NOT NULL DEFAULT 30,
  max_redemptions INTEGER DEFAULT 100,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by_admin_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Coupons policies
CREATE POLICY "Super admins can manage coupons"
ON public.coupons FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Anyone can view active coupons for redemption"
ON public.coupons FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- 8. Create coupon_redemptions table
CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  redeemed_by_user_id UUID NOT NULL,
  days_granted_snapshot INTEGER NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, household_id)
);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all redemptions"
ON public.coupon_redemptions FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their household redemptions"
ON public.coupon_redemptions FOR SELECT
USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Household admins can create redemptions"
ON public.coupon_redemptions FOR INSERT
WITH CHECK (public.is_household_admin(auth.uid(), household_id));

-- 9. Create admin_audit_logs table
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'household', 'coupon', 'plan')),
  target_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can create audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()) OR admin_user_id = auth.uid());

-- 10. Add is_blocked to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

-- 11. Function to redeem coupon
CREATE OR REPLACE FUNCTION public.redeem_coupon(_code VARCHAR(20), _household_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  coupon_record RECORD;
  plan_record RECORD;
  user_id UUID;
  new_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Check if user is household admin
  IF NOT public.is_household_admin(user_id, _household_id) THEN
    RETURN json_build_object('success', false, 'error', 'Apenas o dono da família pode resgatar cupons');
  END IF;

  -- Find the coupon
  SELECT * INTO coupon_record
  FROM public.coupons
  WHERE UPPER(code) = UPPER(_code)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_redemptions IS NULL OR redeemed_count < max_redemptions);

  IF coupon_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Cupom inválido, expirado ou limite de resgates atingido');
  END IF;

  -- Check if already redeemed by this household
  IF EXISTS (
    SELECT 1 FROM public.coupon_redemptions
    WHERE coupon_id = coupon_record.id AND household_id = _household_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Este cupom já foi resgatado por esta família');
  END IF;

  -- Get current plan
  SELECT * INTO plan_record
  FROM public.household_plans
  WHERE household_id = _household_id;

  -- Calculate new expiration
  IF plan_record.plan = 'PRO' AND plan_record.pro_expires_at IS NOT NULL AND plan_record.pro_expires_at > now() THEN
    -- Add days to existing expiration
    new_expires_at := plan_record.pro_expires_at + (coupon_record.days_granted || ' days')::interval;
  ELSE
    -- Start from today
    new_expires_at := now() + (coupon_record.days_granted || ' days')::interval;
  END IF;

  -- Update the plan
  UPDATE public.household_plans
  SET plan = 'PRO',
      status = 'active',
      pro_expires_at = new_expires_at,
      source = 'coupon',
      updated_at = now()
  WHERE household_id = _household_id;

  -- Record redemption
  INSERT INTO public.coupon_redemptions (coupon_id, household_id, redeemed_by_user_id, days_granted_snapshot)
  VALUES (coupon_record.id, _household_id, user_id, coupon_record.days_granted);

  -- Increment coupon usage
  UPDATE public.coupons
  SET redeemed_count = redeemed_count + 1, updated_at = now()
  WHERE id = coupon_record.id;

  -- Log the action
  INSERT INTO public.admin_audit_logs (admin_user_id, action_type, target_type, target_id, metadata)
  VALUES (user_id, 'coupon_redeemed', 'household', _household_id, 
    json_build_object('coupon_code', coupon_record.code, 'days_granted', coupon_record.days_granted, 'new_expires_at', new_expires_at));

  RETURN json_build_object(
    'success', true, 
    'message', 'Cupom resgatado com sucesso!',
    'days_granted', coupon_record.days_granted,
    'pro_expires_at', new_expires_at
  );
END;
$$;

-- 12. Function to grant pro days (admin only)
CREATE OR REPLACE FUNCTION public.admin_grant_pro_days(_household_id UUID, _days INTEGER, _admin_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_record RECORD;
  new_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Verify admin
  IF NOT public.is_super_admin(_admin_id) THEN
    RETURN json_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  -- Get current plan
  SELECT * INTO plan_record
  FROM public.household_plans
  WHERE household_id = _household_id;

  IF plan_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Família não encontrada');
  END IF;

  -- Calculate new expiration
  IF plan_record.plan = 'PRO' AND plan_record.pro_expires_at IS NOT NULL AND plan_record.pro_expires_at > now() THEN
    new_expires_at := plan_record.pro_expires_at + (_days || ' days')::interval;
  ELSE
    new_expires_at := now() + (_days || ' days')::interval;
  END IF;

  -- Update the plan
  UPDATE public.household_plans
  SET plan = 'PRO',
      status = 'active',
      pro_expires_at = new_expires_at,
      source = 'admin_grant',
      updated_at = now()
  WHERE household_id = _household_id;

  -- Log the action
  INSERT INTO public.admin_audit_logs (admin_user_id, action_type, target_type, target_id, metadata)
  VALUES (_admin_id, 'grant_pro_days', 'household', _household_id, 
    json_build_object('days_granted', _days, 'new_expires_at', new_expires_at));

  RETURN json_build_object('success', true, 'message', 'Pro concedido com sucesso', 'pro_expires_at', new_expires_at);
END;
$$;

-- 13. Function to set plan (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_plan(_household_id UUID, _plan plan_type, _expires_at TIMESTAMP WITH TIME ZONE, _admin_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify admin
  IF NOT public.is_super_admin(_admin_id) THEN
    RETURN json_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  -- Update the plan
  UPDATE public.household_plans
  SET plan = _plan,
      status = 'active',
      pro_expires_at = CASE WHEN _plan = 'PRO' THEN _expires_at ELSE NULL END,
      source = 'admin_grant',
      updated_at = now()
  WHERE household_id = _household_id;

  -- Log the action
  INSERT INTO public.admin_audit_logs (admin_user_id, action_type, target_type, target_id, metadata)
  VALUES (_admin_id, 'change_plan', 'household', _household_id, 
    json_build_object('new_plan', _plan, 'expires_at', _expires_at));

  RETURN json_build_object('success', true, 'message', 'Plano alterado com sucesso');
END;
$$;

-- 14. Super admin policies for households (view all)
CREATE POLICY "Super admins can view all households"
ON public.households FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 15. Super admin policies for profiles (view all)
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all profiles"
ON public.profiles FOR UPDATE
USING (public.is_super_admin(auth.uid()));

-- 16. Super admin policies for household_plans (manage all)
CREATE POLICY "Super admins can view all plans"
ON public.household_plans FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all plans"
ON public.household_plans FOR UPDATE
USING (public.is_super_admin(auth.uid()));

-- 17. Super admin policies for household_members
CREATE POLICY "Super admins can view all members"
ON public.household_members FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 18. Super admin policies for transactions (view for stats)
CREATE POLICY "Super admins can view all transactions"
ON public.transactions FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 19. Super admin policies for accounts
CREATE POLICY "Super admins can view all accounts"
ON public.accounts FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 20. Indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_coupons_code ON public.coupons(code);
CREATE INDEX idx_coupon_redemptions_coupon_id ON public.coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_household_id ON public.coupon_redemptions(household_id);
CREATE INDEX idx_audit_logs_admin_id ON public.admin_audit_logs(admin_user_id);
CREATE INDEX idx_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);