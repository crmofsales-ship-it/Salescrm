-- ================================================================
-- DSR Recipient Configuration Table
-- Stores which specific Super Admins and Sales Heads receive the
-- automatic 8 PM DSR. Managed by owners via the CRM UI.
-- Run in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS dsr_recipient_config (
  user_id    UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_by   UUID  REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_dsr_recipient_config_user ON dsr_recipient_config(user_id);
