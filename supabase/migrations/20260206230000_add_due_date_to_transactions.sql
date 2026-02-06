-- Add due_date to transactions (for boletos/bills with due dates)
-- This does NOT change existing data; due_date is nullable.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Index for efficient pending queries
CREATE INDEX IF NOT EXISTS idx_transactions_pending_due
  ON public.transactions (household_id, status, due_date)
  WHERE status = 'pending';

-- Index for inactivity detection (latest transaction per household)
CREATE INDEX IF NOT EXISTS idx_transactions_household_date
  ON public.transactions (household_id, transaction_date DESC);
