-- Create table for join requests
CREATE TABLE public.household_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  invite_id UUID REFERENCES public.household_invites(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  responded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(household_id, user_id, status)
);

-- Enable RLS
ALTER TABLE public.household_join_requests ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own requests"
ON public.household_join_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view household requests"
ON public.household_join_requests
FOR SELECT
USING (is_household_admin(auth.uid(), household_id));

CREATE POLICY "Users can create requests"
ON public.household_join_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update requests"
ON public.household_join_requests
FOR UPDATE
USING (is_household_admin(auth.uid(), household_id));

-- Index for faster queries
CREATE INDEX idx_join_requests_household_status ON public.household_join_requests(household_id, status);
CREATE INDEX idx_join_requests_user ON public.household_join_requests(user_id);

-- Update the join function to create a request instead of adding directly
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
  existing_member BOOLEAN;
  existing_request RECORD;
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
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = invite_record.household_id
    AND household_members.user_id = join_household_by_code.user_id
  ) INTO existing_member;

  IF existing_member THEN
    RETURN json_build_object('success', false, 'error', 'Você já faz parte desta família');
  END IF;

  -- Check if user already has a pending request
  SELECT * INTO existing_request
  FROM public.household_join_requests
  WHERE household_id = invite_record.household_id
  AND household_join_requests.user_id = join_household_by_code.user_id
  AND status = 'pending';

  IF existing_request IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Você já tem uma solicitação pendente para esta família');
  END IF;

  -- Create join request instead of adding directly
  INSERT INTO public.household_join_requests (household_id, user_id, invite_id)
  VALUES (invite_record.household_id, user_id, invite_record.id);

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
    'pending', true,
    'household_id', household_record.id,
    'household_name', household_record.name,
    'message', 'Solicitação enviada! Aguarde a aprovação do administrador.'
  );
END;
$$;

-- Function to approve/reject requests
CREATE OR REPLACE FUNCTION public.respond_to_join_request(_request_id UUID, _approve BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record RECORD;
  admin_id UUID;
BEGIN
  admin_id := auth.uid();
  
  IF admin_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Get the request
  SELECT * INTO request_record
  FROM public.household_join_requests
  WHERE id = _request_id AND status = 'pending';

  IF request_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Solicitação não encontrada ou já processada');
  END IF;

  -- Check if user is admin
  IF NOT is_household_admin(admin_id, request_record.household_id) THEN
    RETURN json_build_object('success', false, 'error', 'Você não tem permissão para aprovar solicitações');
  END IF;

  IF _approve THEN
    -- Add user as member
    INSERT INTO public.household_members (household_id, user_id, role, invited_by)
    VALUES (request_record.household_id, request_record.user_id, 'member', admin_id);
    
    -- Update request status
    UPDATE public.household_join_requests
    SET status = 'approved', responded_at = now(), responded_by = admin_id
    WHERE id = _request_id;

    RETURN json_build_object('success', true, 'message', 'Membro aprovado com sucesso');
  ELSE
    -- Reject request
    UPDATE public.household_join_requests
    SET status = 'rejected', responded_at = now(), responded_by = admin_id
    WHERE id = _request_id;

    RETURN json_build_object('success', true, 'message', 'Solicitação rejeitada');
  END IF;
END;
$$;