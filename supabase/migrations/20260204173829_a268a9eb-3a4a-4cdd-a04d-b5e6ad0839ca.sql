
-- Drop and recreate join_household_by_code function for DIRECT JOIN (no approval needed)
-- This is a transactional function that safely adds the user as a member
CREATE OR REPLACE FUNCTION public.join_household_by_code(_code VARCHAR)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invite_record RECORD;
  current_user_id UUID;
  household_record RECORD;
  existing_member BOOLEAN;
  new_member_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Normalize code: trim and uppercase
  _code := UPPER(TRIM(_code));

  -- Find valid invite (transactional lock with FOR UPDATE to prevent race conditions)
  SELECT * INTO invite_record
  FROM public.household_invites
  WHERE code = _code
    AND is_active = true
    AND expires_at > now()
    AND (max_uses IS NULL OR uses_count < max_uses)
  FOR UPDATE;

  IF invite_record IS NULL THEN
    -- Check if code exists but is invalid (for better error messages)
    IF EXISTS (SELECT 1 FROM public.household_invites WHERE code = _code) THEN
      -- Code exists, check why it's invalid
      IF EXISTS (SELECT 1 FROM public.household_invites WHERE code = _code AND is_active = false) THEN
        RETURN json_build_object('success', false, 'error', 'Este convite foi revogado');
      ELSIF EXISTS (SELECT 1 FROM public.household_invites WHERE code = _code AND expires_at <= now()) THEN
        RETURN json_build_object('success', false, 'error', 'Este convite expirou');
      ELSIF EXISTS (SELECT 1 FROM public.household_invites WHERE code = _code AND uses_count >= max_uses) THEN
        RETURN json_build_object('success', false, 'error', 'Este convite já atingiu o limite de usos');
      END IF;
    END IF;
    RETURN json_build_object('success', false, 'error', 'Código inválido');
  END IF;

  -- Check if household exists and is not deleted
  SELECT * INTO household_record
  FROM public.households
  WHERE id = invite_record.household_id;

  IF household_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Esta família não existe mais');
  END IF;

  -- Check if user is already a member
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = invite_record.household_id
    AND user_id = current_user_id
  ) INTO existing_member;

  IF existing_member THEN
    RETURN json_build_object('success', false, 'error', 'Você já faz parte desta família');
  END IF;

  -- DIRECT JOIN: Add user as member immediately (transactional)
  INSERT INTO public.household_members (household_id, user_id, role, invited_by)
  VALUES (invite_record.household_id, current_user_id, 'member', invite_record.created_by)
  RETURNING id INTO new_member_id;

  -- Increment uses count
  UPDATE public.household_invites
  SET uses_count = uses_count + 1
  WHERE id = invite_record.id;

  -- Delete any pending join requests for this user/household (cleanup)
  DELETE FROM public.household_join_requests
  WHERE household_id = invite_record.household_id
  AND user_id = current_user_id
  AND status = 'pending';

  RETURN json_build_object(
    'success', true, 
    'pending', false,
    'household_id', household_record.id,
    'household_name', household_record.name,
    'member_id', new_member_id,
    'message', 'Você entrou na família com sucesso!'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Você já faz parte desta família');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Erro ao processar o convite: ' || SQLERRM);
END;
$$;

-- Ensure unique constraint exists on household_members to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'household_members_household_user_unique'
  ) THEN
    ALTER TABLE public.household_members
    ADD CONSTRAINT household_members_household_user_unique 
    UNIQUE (household_id, user_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create a function to generate secure invite codes (improved)
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS VARCHAR(8)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  -- Exclude ambiguous characters: 0, O, 1, I, L
  chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result VARCHAR(8) := '';
  i INTEGER;
  code_exists BOOLEAN;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    -- Check if code already exists
    SELECT EXISTS (
      SELECT 1 FROM public.household_invites WHERE code = result
    ) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN result;
END;
$$;

-- Ensure proper RLS policies on household_invites
-- First drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Admins can create invites" ON public.household_invites;
DROP POLICY IF EXISTS "Admins can update invites" ON public.household_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.household_invites;
DROP POLICY IF EXISTS "Members can view household invites" ON public.household_invites;
DROP POLICY IF EXISTS "Anyone can check invite codes" ON public.household_invites;

-- Recreate policies
-- Only admins/owners can view invites of their household
CREATE POLICY "Household admins can view invites" 
ON public.household_invites FOR SELECT 
USING (is_household_admin(auth.uid(), household_id));

-- Only admins/owners can create invites for their household
CREATE POLICY "Household admins can create invites" 
ON public.household_invites FOR INSERT 
WITH CHECK (is_household_admin(auth.uid(), household_id));

-- Only admins/owners can update (revoke) invites
CREATE POLICY "Household admins can update invites" 
ON public.household_invites FOR UPDATE 
USING (is_household_admin(auth.uid(), household_id));

-- Only admins/owners can delete invites
CREATE POLICY "Household admins can delete invites" 
ON public.household_invites FOR DELETE 
USING (is_household_admin(auth.uid(), household_id));
