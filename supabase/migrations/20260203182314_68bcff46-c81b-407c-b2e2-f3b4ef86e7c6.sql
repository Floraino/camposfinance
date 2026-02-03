-- Add member_id to transactions to track who made the expense
ALTER TABLE public.transactions 
ADD COLUMN member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;

-- Create budgets table for monthly/weekly budget management
CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'monthly')),
  amount numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_type, start_date)
);

-- Enable RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- RLS policies for budgets
CREATE POLICY "Users can view their own budgets"
ON public.budgets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets"
ON public.budgets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets"
ON public.budgets FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets"
ON public.budgets FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_budgets_updated_at
BEFORE UPDATE ON public.budgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();