-- ============================================================
-- Migration: Split participants por MEMBRO (não por família)
-- ============================================================
-- Adiciona participant_user_id para rastrear membros individuais
-- no rateio ao invés de famílias inteiras.
--
-- COMO APLICAR:
-- Copie todo este SQL e cole no Supabase Dashboard > SQL Editor > Run
-- ============================================================

-- 1. Adicionar coluna participant_user_id (nullable para compatibilidade)
ALTER TABLE public.split_participants
  ADD COLUMN IF NOT EXISTS participant_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Remover constraint UNIQUE antiga (por família)
ALTER TABLE public.split_participants
  DROP CONSTRAINT IF EXISTS split_participants_split_event_id_participant_household_id_key;

-- 3. Criar constraint UNIQUE nova (por membro) — parcial, ignora NULLs
CREATE UNIQUE INDEX IF NOT EXISTS split_participants_event_user_unique
  ON public.split_participants(split_event_id, participant_user_id)
  WHERE participant_user_id IS NOT NULL;

-- 4. Atualizar a função can_view_split_event para também checar participant_user_id
CREATE OR REPLACE FUNCTION public.can_view_split_event(_user_id UUID, _split_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- User é membro do household dono
    SELECT 1
    FROM split_events se
    JOIN household_members hm ON hm.household_id = se.owner_household_id
    WHERE se.id = _split_event_id AND hm.user_id = _user_id
    UNION
    -- User é membro de um household participante (legado)
    SELECT 1
    FROM split_participants sp
    JOIN household_members hm ON hm.household_id = sp.participant_household_id
    WHERE sp.split_event_id = _split_event_id AND hm.user_id = _user_id
    UNION
    -- User é participante direto (novo: por membro)
    SELECT 1
    FROM split_participants sp
    WHERE sp.split_event_id = _split_event_id AND sp.participant_user_id = _user_id
  )
$$;
