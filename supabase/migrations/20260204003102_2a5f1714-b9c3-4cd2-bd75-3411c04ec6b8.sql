-- Create table for household invite codes
CREATE TABLE public.household_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  code VARCHAR(8) NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  max_uses INTEGER DEFAULT 10,
  uses_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- Only household members can view invites
CREATE POLICY "Members can view household invites"
  ON public.household_invites FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));

-- Only admins can create invites
CREATE POLICY "Admins can create invites"
  ON public.household_invites FOR INSERT
  WITH CHECK (public.is_household_admin(auth.uid(), household_id));

-- Only admins can update invites
CREATE POLICY "Admins can update invites"
  ON public.household_invites FOR UPDATE
  USING (public.is_household_admin(auth.uid(), household_id));

-- Only admins can delete invites
CREATE POLICY "Admins can delete invites"
  ON public.household_invites FOR DELETE
  USING (public.is_household_admin(auth.uid(), household_id));

-- Function to generate random invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS VARCHAR(8)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(8) := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Function to join household by invite code (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.join_household_by_code(_code VARCHAR(8))
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
  user_id UUID;
  household_record RECORD;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Find the invite
  SELECT * INTO invite_record
  FROM public.household_invites
  WHERE code = UPPER(_code)
    AND is_active = true
    AND expires_at > now()
    AND (max_uses IS NULL OR uses_count < max_uses);

  IF invite_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Código inválido ou expirado');
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = invite_record.household_id
    AND household_members.user_id = join_household_by_code.user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Você já faz parte desta família');
  END IF;

  -- Add user as member
  INSERT INTO public.household_members (household_id, user_id, role, invited_by)
  VALUES (invite_record.household_id, user_id, 'member', invite_record.created_by);

  -- Increment uses count
  UPDATE public.household_invites
  SET uses_count = uses_count + 1
  WHERE id = invite_record.id;

  -- Get household info
  SELECT * INTO household_record
  FROM public.households
  WHERE id = invite_record.household_id;

  RETURN json_build_object(
    'success', true, 
    'household_id', household_record.id,
    'household_name', household_record.name
  );
END;
$$;

-- Create index for faster code lookups
CREATE INDEX idx_household_invites_code ON public.household_invites(code);
CREATE INDEX idx_household_invites_household ON public.household_invites(household_id);