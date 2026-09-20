-- ============================================================================
-- Fix — the org / membership INSERT checks compared against
-- public.current_profile_id() (SECURITY DEFINER). That function returns the
-- right value when called directly but evaluates to NULL inside a WITH CHECK,
-- so org creation was always rejected. Replace with an inline subquery that
-- runs as the calling role (the Supabase-recommended pattern).
-- ============================================================================

-- helper: the caller's profile id, as an inline expression (no SECURITY DEFINER)
-- profiles RLS lets an authenticated user read their own row, so this resolves.

DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS omem_bootstrap ON public.organization_members;
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

-- also make current_profile_id resilient for any other caller: fall back to the
-- JWT sub when the profiles lookup is empty in a definer context.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
$$;
