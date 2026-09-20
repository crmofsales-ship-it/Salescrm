-- ============================================================================
-- Part 6 — org-scope the auxiliary tables that were created outside version
-- control (no migration file), if they exist in this database. Safe to run on
-- databases where some or all of these tables are absent.
-- ============================================================================

DO $$
DECLARE
  v_org  UUID;
  t      TEXT;
  aux    TEXT[] := ARRAY[
    'activity_deletion_logs', 'ai_documents', 'ai_document_chunks',
    'lead_inactivity_logs', 'prospects', 'pipeline'
  ];
  r      RECORD;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default';
  IF v_org IS NULL THEN
    RAISE NOTICE 'No default organization — run 0300 first'; RETURN;
  END IF;

  FOREACH t IN ARRAY aux LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip % (absent)', t; CONTINUE;
    END IF;

    -- ai_document_chunks is a child of ai_documents; scope it via parent instead.
    IF t = 'ai_document_chunks' THEN
      EXECUTE 'ALTER TABLE public.ai_document_chunks ENABLE ROW LEVEL SECURITY';
      EXECUTE 'ALTER TABLE public.ai_document_chunks FORCE ROW LEVEL SECURITY';
      FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ai_document_chunks' LOOP
        EXECUTE format('DROP POLICY %I ON public.ai_document_chunks', r.policyname);
      END LOOP;
      IF to_regclass('public.ai_documents') IS NOT NULL THEN
        EXECUTE $p$CREATE POLICY chunk_all ON public.ai_document_chunks FOR ALL TO authenticated
          USING (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)))
          WITH CHECK (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)))$p$;
      END IF;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL', t, v_org);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_'||t||'_org', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format($p$CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated USING (public.is_org_member(organization_id))$p$, t);
  END LOOP;
END $$;
