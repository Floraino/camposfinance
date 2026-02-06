-- ============================================================
-- Função: retornar membros da família com nome do perfil
-- ============================================================
-- Permite que qualquer membro da família veja os nomes (display_name)
-- dos outros membros, sem abrir RLS da tabela profiles.
-- Execute no Supabase > SQL Editor se não usar migrations.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_household_members_with_display_names(_household_id UUID)
RETURNS TABLE (
  id UUID,
  household_id UUID,
  user_id UUID,
  role public.household_role,
  invited_by UUID,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hm.id,
    hm.household_id,
    hm.user_id,
    hm.role,
    hm.invited_by,
    hm.joined_at,
    hm.created_at,
    hm.updated_at,
    COALESCE(p.display_name, 'Sem nome') AS display_name
  FROM public.household_members hm
  LEFT JOIN public.profiles p ON p.user_id = hm.user_id
  WHERE hm.household_id = _household_id
    AND EXISTS (
      SELECT 1 FROM public.household_members hm2
      WHERE hm2.household_id = _household_id AND hm2.user_id = auth.uid()
    )
  ORDER BY hm.joined_at;
$$;
