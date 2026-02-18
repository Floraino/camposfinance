-- Remove payment_method column from transactions table
-- This migration removes the payment_method column as it's no longer used in the app

-- Drop the column (CASCADE will remove any dependent objects like indexes, constraints, etc.)
ALTER TABLE public.transactions 
DROP COLUMN IF EXISTS payment_method;

-- Note: If there are any views, functions, or triggers that reference payment_method,
-- they should be updated separately before running this migration.
