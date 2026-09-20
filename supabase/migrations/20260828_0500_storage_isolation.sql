-- ============================================================================
-- Part 5 of 5 — storage. Private, organization-scoped buckets.
-- Path convention for every object:  <organization_id>/<entity>/<file>
--
-- On newer Supabase the SQL Editor role cannot always modify the `storage`
-- schema. Everything here is best-effort: if a statement is refused with
-- "permission denied for schema storage", the rest of fresh_install still
-- completes, and you finish storage setup from the dashboard — see
-- supabase/storage_policies.sql for the exact policies to paste into
-- Storage → Policies, or Storage → <bucket> → Policies → New policy.
-- ============================================================================

-- path helper lives in public (storage schema may be read-only here)
CREATE OR REPLACE FUNCTION public.storage_org_from_path(p_name text)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF((string_to_array(p_name,'/'))[1], '')::uuid
$$;

DO $do$
BEGIN
  -- buckets: private tenant buckets + a public-read logo bucket
  INSERT INTO storage.buckets (id, name, public) VALUES ('crm-files','crm-files', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files','chat-files', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  INSERT INTO storage.buckets (id, name, public) VALUES ('ai-documents','ai-documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('org-logos','org-logos', true, 2097152,
            ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
    ON CONFLICT (id) DO UPDATE
       SET public = true, file_size_limit = 2097152,
           allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'];

  -- drop any legacy permissive policies
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "chat_files_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "crm_files_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all for anon" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logos_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "tenant_files_rw" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logo_write" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logo_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logo_delete" ON storage.objects';
  END;

  EXECUTE $p$
    CREATE POLICY tenant_files_rw ON storage.objects FOR ALL TO authenticated
      USING (bucket_id IN ('crm-files','chat-files','ai-documents')
             AND public.is_org_member(public.storage_org_from_path(name)))
      WITH CHECK (bucket_id IN ('crm-files','chat-files','ai-documents')
             AND public.is_org_member(public.storage_org_from_path(name)))
  $p$;
  EXECUTE $p$
    CREATE POLICY org_logo_write ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'org-logos'
             AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY org_logo_update ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'org-logos' AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
      WITH CHECK (bucket_id = 'org-logos' AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY org_logo_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'org-logos' AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
  $p$;

  RAISE NOTICE 'storage: buckets + policies applied';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'storage: SQL Editor lacks privileges on the storage schema — finish this step from the dashboard (see supabase/storage_policies.sql). The rest of the install is unaffected.';
END $do$;
