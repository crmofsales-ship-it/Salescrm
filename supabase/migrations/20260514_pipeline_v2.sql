-- ============================================================
-- Pipeline v2: kanban stages + multi-contact methods
-- ============================================================

-- 1. Pipeline-specific kanban stage (independent from leads.stage)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'new_prospect';

-- 2. Dynamic contact methods array (LinkedIn, WhatsApp, etc.)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]';

-- 3. Index for fast pipeline queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage) WHERE stage = 'pipeline';
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
