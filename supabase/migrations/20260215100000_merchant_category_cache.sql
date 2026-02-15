-- Cache de categorização por "merchant fingerprint" (acelera e evita IA)
CREATE TABLE IF NOT EXISTS public.merchant_category_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(household_id, fingerprint)
);

CREATE INDEX idx_merchant_cache_household_fingerprint ON public.merchant_category_cache(household_id, fingerprint);

ALTER TABLE public.merchant_category_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their household merchant cache"
  ON public.merchant_category_cache FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can insert merchant cache"
  ON public.merchant_category_cache FOR INSERT
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can update merchant cache"
  ON public.merchant_category_cache FOR UPDATE
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can delete merchant cache"
  ON public.merchant_category_cache FOR DELETE
  USING (public.is_household_member(auth.uid(), household_id));

COMMENT ON TABLE public.merchant_category_cache IS 'Cache: fingerprint da descrição -> categoria (aprendido por regras/IA/manual)';
