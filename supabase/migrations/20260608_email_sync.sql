-- ============================================================
-- Email Sync: connected accounts + raw email log
-- ============================================================

-- Connected email accounts (one per user per email address)
CREATE TABLE IF NOT EXISTS email_accounts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider        TEXT        NOT NULL DEFAULT 'gmail',
  email           TEXT        NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TIMESTAMPTZ,
  history_id      TEXT,
  last_sync_at    TIMESTAMPTZ,
  is_active       BOOLEAN     DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Raw emails fetched from provider, pending user activity-type classification
CREATE TABLE IF NOT EXISTS email_sync_log (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email_account_id  UUID        NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id        TEXT        NOT NULL,
  thread_id         TEXT,
  subject           TEXT,
  from_email        TEXT,
  to_emails         TEXT[]      DEFAULT '{}',
  cc_emails         TEXT[]      DEFAULT '{}',
  bcc_emails        TEXT[]      DEFAULT '{}',
  sent_at           TIMESTAMPTZ,
  attachment_count  INTEGER     DEFAULT 0,
  snippet           TEXT,
  direction         TEXT        DEFAULT 'outbound',
  status            TEXT        DEFAULT 'pending',
  activity_type     TEXT,
  lead_id           UUID        REFERENCES leads(id) ON DELETE SET NULL,
  deal_id           UUID        REFERENCES deals(id) ON DELETE SET NULL,
  activity_id       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email_account_id, message_id)
);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sync_log  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_accounts_all" ON email_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_sync_log_all" ON email_sync_log  FOR ALL USING (true) WITH CHECK (true);
