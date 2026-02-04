
-- Drop existing policies for split_events
DROP POLICY IF EXISTS "Admins can create split events" ON public.split_events;
DROP POLICY IF EXISTS "Admins can update split events" ON public.split_events;
DROP POLICY IF EXISTS "Admins can delete split events" ON public.split_events;
DROP POLICY IF EXISTS "Users can view accessible split events" ON public.split_events;

-- Drop existing policies for split_participants
DROP POLICY IF EXISTS "Admins can add split participants" ON public.split_participants;
DROP POLICY IF EXISTS "Admins can update split participants" ON public.split_participants;
DROP POLICY IF EXISTS "Admins can delete split participants" ON public.split_participants;
DROP POLICY IF EXISTS "Users can view split participants" ON public.split_participants;

-- CREATE NEW POLICIES FOR split_events

-- SELECT: Members of the owner household can view
CREATE POLICY "Members can view split events"
ON public.split_events
FOR SELECT
TO authenticated
USING (
  public.is_household_member(auth.uid(), owner_household_id)
);

-- INSERT: Only admins/owners of the household can create
-- IMPORTANT: The check must validate owner_household_id AND created_by_user_id
CREATE POLICY "Admins can create split events"
ON public.split_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_household_admin(auth.uid(), owner_household_id)
  AND created_by_user_id = auth.uid()
);

-- UPDATE: Only admins/owners can update
CREATE POLICY "Admins can update split events"
ON public.split_events
FOR UPDATE
TO authenticated
USING (
  public.is_household_admin(auth.uid(), owner_household_id)
);

-- DELETE: Only admins/owners can delete
CREATE POLICY "Admins can delete split events"
ON public.split_events
FOR DELETE
TO authenticated
USING (
  public.is_household_admin(auth.uid(), owner_household_id)
);

-- CREATE NEW POLICIES FOR split_participants

-- SELECT: Members of the split event's owner household can view
CREATE POLICY "Members can view split participants"
ON public.split_participants
FOR SELECT
TO authenticated
USING (
  public.can_view_split_event(auth.uid(), split_event_id)
);

-- INSERT: Only admins of the split event's household can add participants
CREATE POLICY "Admins can add split participants"
ON public.split_participants
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_split_event(auth.uid(), split_event_id)
);

-- UPDATE: Only admins can update participants
CREATE POLICY "Admins can update split participants"
ON public.split_participants
FOR UPDATE
TO authenticated
USING (
  public.can_manage_split_event(auth.uid(), split_event_id)
);

-- DELETE: Only admins can delete participants
CREATE POLICY "Admins can delete split participants"
ON public.split_participants
FOR DELETE
TO authenticated
USING (
  public.can_manage_split_event(auth.uid(), split_event_id)
);
