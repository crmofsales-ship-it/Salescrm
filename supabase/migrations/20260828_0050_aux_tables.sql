-- ============================================================================
-- Part 0 — auxiliary tables that the app code uses but that were created by hand
-- in the old project's dashboard (no migration existed). Create them here so a
-- fresh database is complete. IF NOT EXISTS everywhere → safe on existing DBs.
-- Runs before 0100; 0300/0600 then add organization_id + RLS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  file_type     TEXT,
  size_bytes    BIGINT,
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','error')),
  chunk_count   INTEGER DEFAULT 0,
  file_url      TEXT,
  error_message TEXT,
  uploaded_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.ai_documents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_document_chunks_doc ON public.ai_document_chunks(document_id);

CREATE TABLE IF NOT EXISTS public.lead_inactivity_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL,
  assigned_to_at_event UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_assigned_to      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  triggered_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_inactivity_logs_lead ON public.lead_inactivity_logs(lead_id);

CREATE TABLE IF NOT EXISTS public.activity_deletion_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id      UUID,
  activity_type    TEXT,
  activity_title   TEXT,
  related_type     TEXT,
  related_id       UUID,
  lead_id          UUID,
  deal_id          UUID,
  original_creator UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleter_name     TEXT,
  deleter_role     TEXT,
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Light-weight prospect list used by the AI search tool.
CREATE TABLE IF NOT EXISTS public.prospects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name TEXT,
  company_name TEXT,
  email        TEXT,
  phone        TEXT,
  status       TEXT DEFAULT 'new',
  assigned_to  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
