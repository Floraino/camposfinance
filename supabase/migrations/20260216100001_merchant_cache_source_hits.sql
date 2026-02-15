-- Estender merchant_category_cache: source (manual|rule) e hits (histórico determinístico sem IA)
ALTER TABLE public.merchant_category_cache
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'rule')),
  ADD COLUMN IF NOT EXISTS hits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_merchant_cache_family_category ON public.merchant_category_cache(household_id, category);

COMMENT ON COLUMN public.merchant_category_cache.source IS 'manual = usuário categorizou; rule = aplicado por regra/cache';
