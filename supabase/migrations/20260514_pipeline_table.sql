-- Pipeline table: prospects without contact details (pre-lead stage)

CREATE TABLE IF NOT EXISTS pipeline (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name     TEXT        NOT NULL,
  contact_name     TEXT,
  email            TEXT,
  phone            TEXT,
  source           TEXT,
  stage            TEXT        DEFAULT 'new',
  temperature      TEXT        DEFAULT 'warm',
  priority         TEXT        DEFAULT 'medium',
  service_interested TEXT,
  remarks          TEXT,
  other_notes      JSONB       DEFAULT '{}',
  assigned_to      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;

-- Open policies (Firebase auth users appear as anon, app enforces RBAC)
CREATE POLICY "pipeline_select" ON pipeline FOR SELECT USING (true);
CREATE POLICY "pipeline_insert" ON pipeline FOR INSERT WITH CHECK (true);
CREATE POLICY "pipeline_update" ON pipeline FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "pipeline_delete" ON pipeline FOR DELETE USING (true);
