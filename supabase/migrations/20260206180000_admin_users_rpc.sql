-- Admin-only RPCs for listing and counting users (bypasses any RLS issues on client).
-- Only super_admins can call these; they use SECURITY DEFINER to read from profiles.

-- Count all profiles (for dashboard card).
CREATE OR REPLACE FUNCTION public.admin_get_profiles_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN 0;
  END IF;
  RETURN (SELECT count(*)::bigint FROM public.profiles);
END;
$$;

-- Count profiles matching search (for pagination when filtering).
CREATE OR REPLACE FUNCTION public.admin_get_profiles_count_filtered(_search TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN 0;
  END IF;
  RETURN (
    SELECT count(*)::bigint FROM public.profiles p
    WHERE (_search IS NULL OR _search = '' OR p.display_name ILIKE '%' || _search || '%')
  );
END;
$$;

-- List profiles with optional search and pagination.
CREATE OR REPLACE FUNCTION public.admin_get_profiles(
  _search TEXT DEFAULT NULL,
  _limit INT DEFAULT 100,
  _offset INT DEFAULT 0
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.user_id, p.display_name, p.avatar_url, p.is_blocked, p.created_at, p.updated_at
  FROM public.profiles p
  WHERE (_search IS NULL OR _search = '' OR p.display_name ILIKE '%' || _search || '%')
  ORDER BY p.created_at DESC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

-- Get single profile by user_id (for detail drawer).
CREATE OR REPLACE FUNCTION public.admin_get_profile_by_user_id(_user_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT p FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1);
END;
$$;
