-- ============================================================================
-- Fix — the profiles_select policy queried public.profiles inside its own body
-- (via the co-member join), which Postgres rejects as infinite recursion. Move
-- that lookup into a SECURITY DEFINER function so RLS is not re-applied inside.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.co_member_profile_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT om2.user_id
  FROM public.organization_members om1
  JOIN public.organization_members om2 ON om2.organization_id = om1.organization_id
  JOIN public.profiles me ON me.id = om1.user_id
  WHERE me.user_id = auth.uid() AND om1.status = 'active'
$$;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR id IN (SELECT public.co_member_profile_ids())
  );
