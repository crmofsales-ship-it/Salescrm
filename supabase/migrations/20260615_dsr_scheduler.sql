-- Auto Email Scheduler config per user
CREATE TABLE IF NOT EXISTS dsr_scheduler (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT true,
  report_type      text NOT NULL DEFAULT 'daily',
  employee_ids     uuid[] DEFAULT NULL,
  recipient_emails text[] NOT NULL DEFAULT '{}',
  time_slot        text NOT NULL DEFAULT '08:00 PM',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE dsr_scheduler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scheduler" ON dsr_scheduler
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS dsr_scheduler_enabled_slot
  ON dsr_scheduler (enabled, time_slot);
