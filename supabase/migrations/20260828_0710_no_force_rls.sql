-- ============================================================================
-- Fix — 0400/0600 set FORCE ROW LEVEL SECURITY on every table. That also makes
-- the table OWNER (postgres) subject to RLS, which breaks our SECURITY DEFINER
-- helper functions (current_profile_id, user_org_ids, is_org_member, …): they
-- run as postgres, the policies are TO authenticated, so the helpers see zero
-- rows and every org-scoped CHECK fails.
--
-- RLS stays ENABLED (enforced for anon + authenticated). We only drop FORCE.
-- The backend's service_role key bypasses RLS via the role's BYPASSRLS attribute
-- regardless, so the security posture for real clients is unchanged.
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
