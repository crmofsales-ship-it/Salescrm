-- Migration: Inactivity Alert Configuration
-- Stores per-user inactivity alert settings for Super Admins and Sales Heads
-- Run this in: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS inactivity_alert_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT true,
  threshold_days   integer NOT NULL DEFAULT 3 CHECK (threshold_days >= 1 AND threshold_days <= 365),
  time_slot        text NOT NULL DEFAULT '08:00 PM',
  recipient_emails text[] NOT NULL DEFAULT '{}',
  frequency        text NOT NULL DEFAULT 'daily'   CHECK (frequency   IN ('daily', 'weekly', 'monthly')),
  email_format     text NOT NULL DEFAULT 'summary' CHECK (email_format IN ('summary', 'detailed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE inactivity_alert_config ENABLE ROW LEVEL SECURITY;

-- Open policy — access is enforced at the API layer (authenticate + authorize middleware)
CREATE POLICY "inactivity_alert_config_all" ON inactivity_alert_config
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inactivity_alert_cfg_user   ON inactivity_alert_config(user_id);
CREATE INDEX IF NOT EXISTS idx_inactivity_alert_cfg_slot   ON inactivity_alert_config(time_slot) WHERE enabled = true;
