-- ============================================================
-- Email Activity v3: follow-up tracking
-- ============================================================
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS follow_up_date   DATE;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'none';

-- Run the v2 migration columns too (idempotent if already run)
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS reason          TEXT;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS customer_id     UUID;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS pipeline_id     UUID;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_module      TEXT;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_record_name TEXT;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS sender_name     TEXT;

CREATE INDEX IF NOT EXISTS idx_esl_user_id     ON email_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_esl_sent_at     ON email_sync_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_esl_status      ON email_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_esl_lead_id     ON email_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_esl_crm_module  ON email_sync_log(crm_module);
