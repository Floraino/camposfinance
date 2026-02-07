-- Remove income: app controla apenas despesas.
-- Normaliza amount: qualquer valor positivo (antigo "receita") vira negativo (tratado como despesa).
UPDATE public.transactions
SET amount = -ABS(amount)
WHERE amount > 0;
