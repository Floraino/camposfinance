-- Fix the calculate_split_amount function to set search_path
CREATE OR REPLACE FUNCTION public.calculate_split_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT (se.total_amount * NEW.shares / se.total_shares)
  INTO NEW.amount_calculated
  FROM split_events se
  WHERE se.id = NEW.split_event_id;
  
  RETURN NEW;
END;
$$;