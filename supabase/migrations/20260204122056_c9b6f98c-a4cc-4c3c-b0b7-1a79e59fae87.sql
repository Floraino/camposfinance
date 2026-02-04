-- Create enum for split event status
CREATE TYPE public.split_event_status AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- Create enum for payment status
CREATE TYPE public.split_payment_status AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- Create split_events table
CREATE TABLE public.split_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
  total_shares INTEGER NOT NULL CHECK (total_shares > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  status public.split_event_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create split_participants table
CREATE TABLE public.split_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  split_event_id UUID NOT NULL REFERENCES public.split_events(id) ON DELETE CASCADE,
  participant_household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  payer_user_id UUID,
  shares INTEGER NOT NULL CHECK (shares > 0),
  amount_calculated NUMERIC NOT NULL DEFAULT 0,
  payment_status public.split_payment_status NOT NULL DEFAULT 'UNPAID',
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_method TEXT,
  payment_proof_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(split_event_id, participant_household_id)
);

-- Enable RLS
ALTER TABLE public.split_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_participants ENABLE ROW LEVEL SECURITY;

-- Function to check if user can manage split event (is admin/owner of the owner household)
CREATE OR REPLACE FUNCTION public.can_manage_split_event(_user_id UUID, _split_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM split_events se
    JOIN household_members hm ON hm.household_id = se.owner_household_id
    WHERE se.id = _split_event_id
      AND hm.user_id = _user_id
      AND hm.role IN ('owner', 'admin')
  )
$$;

-- Function to check if user can view split event (is member of owner or participant household)
CREATE OR REPLACE FUNCTION public.can_view_split_event(_user_id UUID, _split_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- User is member of owner household
    SELECT 1
    FROM split_events se
    JOIN household_members hm ON hm.household_id = se.owner_household_id
    WHERE se.id = _split_event_id AND hm.user_id = _user_id
    UNION
    -- User is member of a participant household
    SELECT 1
    FROM split_participants sp
    JOIN household_members hm ON hm.household_id = sp.participant_household_id
    WHERE sp.split_event_id = _split_event_id AND hm.user_id = _user_id
  )
$$;

-- RLS Policies for split_events

-- Admins of owner household can create events
CREATE POLICY "Admins can create split events"
ON public.split_events
FOR INSERT
WITH CHECK (
  is_household_admin(auth.uid(), owner_household_id)
);

-- Users can view events they own or participate in
CREATE POLICY "Users can view accessible split events"
ON public.split_events
FOR SELECT
USING (
  can_view_split_event(auth.uid(), id)
);

-- Admins of owner household can update events
CREATE POLICY "Admins can update split events"
ON public.split_events
FOR UPDATE
USING (
  is_household_admin(auth.uid(), owner_household_id)
);

-- Admins of owner household can delete events
CREATE POLICY "Admins can delete split events"
ON public.split_events
FOR DELETE
USING (
  is_household_admin(auth.uid(), owner_household_id)
);

-- RLS Policies for split_participants

-- Admins of event owner household can add participants
CREATE POLICY "Admins can add split participants"
ON public.split_participants
FOR INSERT
WITH CHECK (
  can_manage_split_event(auth.uid(), split_event_id)
);

-- Users can view participants of events they can access
CREATE POLICY "Users can view split participants"
ON public.split_participants
FOR SELECT
USING (
  can_view_split_event(auth.uid(), split_event_id)
);

-- Admins of event owner household can update participants
CREATE POLICY "Admins can update split participants"
ON public.split_participants
FOR UPDATE
USING (
  can_manage_split_event(auth.uid(), split_event_id)
);

-- Admins of event owner household can delete participants
CREATE POLICY "Admins can delete split participants"
ON public.split_participants
FOR DELETE
USING (
  can_manage_split_event(auth.uid(), split_event_id)
);

-- Trigger to update timestamps
CREATE TRIGGER update_split_events_updated_at
BEFORE UPDATE ON public.split_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_split_participants_updated_at
BEFORE UPDATE ON public.split_participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate participant amount
CREATE OR REPLACE FUNCTION public.calculate_split_amount()
RETURNS TRIGGER AS $$
BEGIN
  SELECT (se.total_amount * NEW.shares / se.total_shares)
  INTO NEW.amount_calculated
  FROM split_events se
  WHERE se.id = NEW.split_event_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate amount on insert/update
CREATE TRIGGER calculate_split_participant_amount
BEFORE INSERT OR UPDATE OF shares ON public.split_participants
FOR EACH ROW
EXECUTE FUNCTION public.calculate_split_amount();