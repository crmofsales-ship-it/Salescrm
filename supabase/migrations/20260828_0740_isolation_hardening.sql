-- ============================================================================
-- Isolation hardening (found by a two-organization test against a live project)
--
-- 1. omem_bootstrap let ANY signed-in user insert themselves as `owner` of ANY
--    organization (it only checked that the row was for the caller, not which
--    organization it was for). It now allows only the very first membership of
--    an organization the caller created.
-- 2. omem_write let an admin grant the `owner` role. Only an owner may now.
-- 3. leads.lead_code was unique across ALL tenants, so a second organization's
--    first lead collided with the first organization's LEAD-001. Codes are now
--    unique and generated per organization.
-- ============================================================================

-- ── 1. first-membership bootstrap ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_bootstrap_membership(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.organizations o
             JOIN public.profiles p ON p.id = o.created_by
            WHERE o.id = p_org AND p.user_id = auth.uid()
         )
     AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = p_org)
$$;
REVOKE ALL ON FUNCTION public.can_bootstrap_membership(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_membership(UUID) TO authenticated;

DROP POLICY IF EXISTS omem_bootstrap ON public.organization_members;
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
    AND role = 'owner'
    AND public.can_bootstrap_membership(organization_id)
  );

-- ── 2. only an owner may grant or hold the owner role ───────────────────────
DROP POLICY IF EXISTS omem_write ON public.organization_members;
CREATE POLICY omem_write ON public.organization_members FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id, 'admin'))
  WITH CHECK (
    public.has_org_permission(organization_id, 'admin')
    AND (role <> 'owner' OR public.has_org_permission(organization_id, 'owner'))
  );

-- ── 3. per-organization lead codes ──────────────────────────────────────────
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_code_unique;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_org_lead_code_unique;
ALTER TABLE public.leads ADD CONSTRAINT leads_org_lead_code_unique UNIQUE (organization_id, lead_code);

-- SECURITY DEFINER so it sees every lead in the organization (a sales rep's
-- row-level view is smaller), locked per organization so concurrent inserts
-- cannot draw the same number.
CREATE OR REPLACE FUNCTION public.fn_set_lead_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_code:' || COALESCE(NEW.organization_id::text, '')));
    SELECT COALESCE(MAX(CAST(SUBSTRING(l.lead_code FROM 6) AS INTEGER)), 0) + 1
      INTO next_num
      FROM public.leads l
     WHERE l.organization_id IS NOT DISTINCT FROM NEW.organization_id
       AND l.lead_code ~ '^LEAD-[0-9]+$';
    NEW.lead_code := 'LEAD-' || LPAD(next_num::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_code ON public.leads;
CREATE TRIGGER trg_lead_code
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_lead_code();
