-- Track which pipeline entry originated a lead.
-- Conversion now creates a NEW lead row without touching the pipeline entry.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_id ON leads(pipeline_id);
