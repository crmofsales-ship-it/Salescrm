-- ============================================================================
-- Fix — org creation actually succeeded, but `.insert().select()` failed because
-- org_select only allowed org MEMBERS to read a row. A freshly-created org has
-- no members yet (the membership row is inserted a moment later), so PostgREST
-- could not return the inserted row and surfaced it as an RLS violation.
--
-- Let the creator always see their own org. Also restore the INSERT checks
-- (a diagnostic had loosened them to `true`).
-- ============================================================================

-- caller's profile id, inline (runs as the calling role)
-- profiles RLS already lets an authenticated user read their own row.

DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (
    public.is_org_member(id)
    OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

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

-- members should also be able to read the org rows they belong to via the
-- membership join even before is_org_member() caches — belt and braces:
DROP POLICY IF EXISTS omem_select ON public.organization_members;
CREATE POLICY omem_select ON public.organization_members FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );
