-- ============================================================
-- Email Sync v2: reason capture, enhanced CRM mapping,
-- domain restriction support, performance indexes
-- ============================================================

-- Reason / comment the user provides when classifying an email
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS reason TEXT;

-- Extended CRM mapping (beyond leads → also customers and pipeline)
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS pipeline_id UUID; -- no FK: pipeline table may not exist in all envs

-- Human-readable module and record name for the log table UI
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_module      TEXT; -- 'lead' | 'customer' | 'pipeline'
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_record_name TEXT; -- e.g. "Jane Smith / Acme Corp"

-- Sender's display name (cached from profile at sync time for fast log rendering)
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_esl_user_id     ON email_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_esl_sent_at     ON email_sync_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_esl_status      ON email_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_esl_lead_id     ON email_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_esl_customer_id ON email_sync_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_esl_crm_module  ON email_sync_log(crm_module);
