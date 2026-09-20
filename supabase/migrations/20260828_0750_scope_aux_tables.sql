-- ============================================================================
-- Tenant-scope the auxiliary tables (ai_documents, prospects, lead_inactivity_logs,
-- activity_deletion_logs, ai_document_chunks).
--
-- 0600 did this only when a "default" organization existed, so on a brand-new
-- database it was skipped: the tables had no organization_id and no tenant
-- policies (locked down, but unusable by the app). This version does not depend
-- on a default organization.
-- ============================================================================

DO $$
DECLARE
  v_org UUID;
  t     TEXT;
  r     RECORD;
  aux   TEXT[] := ARRAY['activity_deletion_logs', 'ai_documents', 'lead_inactivity_logs', 'prospects'];
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default';

  FOREACH t IN ARRAY aux LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', t);

    IF t = 'lead_inactivity_logs' THEN
      UPDATE public.lead_inactivity_logs x SET organization_id = l.organization_id
        FROM public.leads l WHERE l.id = x.lead_id AND x.organization_id IS NULL;
    END IF;
    IF v_org IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL', t, v_org);
    END IF;
    -- rows that cannot be attributed to a tenant must not survive
    EXECUTE format('DELETE FROM public.%I WHERE organization_id IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_' || t || '_org', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format($p$CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated USING (public.is_org_member(organization_id))$p$, t);
  END LOOP;

  -- chunks belong to a document; scope them through the parent
  IF to_regclass('public.ai_document_chunks') IS NOT NULL AND to_regclass('public.ai_documents') IS NOT NULL THEN
    ALTER TABLE public.ai_document_chunks ENABLE ROW LEVEL SECURITY;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_document_chunks' LOOP
      EXECUTE format('DROP POLICY %I ON public.ai_document_chunks', r.policyname);
    END LOOP;
    CREATE POLICY chunk_all ON public.ai_document_chunks FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)));
  END IF;
END $$;

-- The nightly inactivity job inserts logs with the service role and no
-- organization; derive it from the lead.
CREATE OR REPLACE FUNCTION public.fn_inactivity_log_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inactivity_log_org ON public.lead_inactivity_logs;
CREATE TRIGGER trg_inactivity_log_org
  BEFORE INSERT ON public.lead_inactivity_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_inactivity_log_org();

ALTER TABLE public.lead_inactivity_logs ADD COLUMN IF NOT EXISTS days_inactive INTEGER;
