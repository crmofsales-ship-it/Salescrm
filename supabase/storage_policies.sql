-- ============================================================================
-- Storage setup — run ONLY if fresh_install.sql printed the storage WARNING
-- ("SQL Editor lacks privileges on the storage schema").
--
-- Two options:
--
--  A) Dashboard (no SQL): Storage → New bucket ×4, then Storage → Policies.
--     Buckets:  crm-files (private), chat-files (private), ai-documents (private),
--               org-logos (public).
--     Then add the 4 policies below via "New policy → custom".
--
--  B) SQL: paste this whole file into the SQL Editor. If it still says
--     "permission denied for schema storage", use option A.
-- ============================================================================

insert into storage.buckets (id, name, public) values ('crm-files','crm-files',false)   on conflict (id) do update set public=false;
insert into storage.buckets (id, name, public) values ('chat-files','chat-files',false)  on conflict (id) do update set public=false;
insert into storage.buckets (id, name, public) values ('ai-documents','ai-documents',false) on conflict (id) do update set public=false;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('org-logos','org-logos',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml'])
  on conflict (id) do update set public=true, file_size_limit=2097152,
    allowed_mime_types=array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists tenant_files_rw on storage.objects;
drop policy if exists org_logo_write on storage.objects;
drop policy if exists org_logo_update on storage.objects;
drop policy if exists org_logo_delete on storage.objects;

-- private tenant buckets: path is <org-id>/… ; only members of that org
create policy tenant_files_rw on storage.objects for all to authenticated
  using (bucket_id in ('crm-files','chat-files','ai-documents')
         and public.is_org_member(public.storage_org_from_path(name)))
  with check (bucket_id in ('crm-files','chat-files','ai-documents')
         and public.is_org_member(public.storage_org_from_path(name)));

-- org logos: public read (bucket is public); only org admins write
create policy org_logo_write on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos'
         and public.has_org_permission(public.storage_org_from_path(name),'admin'));
create policy org_logo_update on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and public.has_org_permission(public.storage_org_from_path(name),'admin'))
  with check (bucket_id = 'org-logos' and public.has_org_permission(public.storage_org_from_path(name),'admin'));
create policy org_logo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and public.has_org_permission(public.storage_org_from_path(name),'admin'));
