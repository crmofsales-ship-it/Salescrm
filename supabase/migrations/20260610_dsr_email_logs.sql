-- ================================================================
-- DSR Email Logs Table
-- Tracks every manual and automated DSR email send for auditing.
-- Run in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS dsr_email_logs (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_by          UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  recipients       TEXT[]       NOT NULL DEFAULT '{}',
  recipient_count  INTEGER      NOT NULL DEFAULT 0,
  report_date      DATE         NOT NULL,
  report_type      TEXT         NOT NULL DEFAULT 'DSR',
  delivery_status  TEXT         NOT NULL DEFAULT 'pending'
                                CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  error_message    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_sent_at     ON dsr_email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_report_date ON dsr_email_logs(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_sent_by     ON dsr_email_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_status      ON dsr_email_logs(delivery_status);

-- Allow service role full access (Supabase default — no extra RLS needed for server-side only)
