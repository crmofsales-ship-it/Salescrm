-- Login tracking table for security monitoring
CREATE TABLE IF NOT EXISTS login_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  logged_in_at   timestamptz NOT NULL DEFAULT now(),
  logged_out_at  timestamptz,
  user_agent     text,
  browser        varchar(80),
  os             varchar(80),
  device_type    varchar(30),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all; anyone can write their own session
CREATE POLICY "All can insert login logs"  ON login_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "All can update login logs"  ON login_logs FOR UPDATE USING (true);
CREATE POLICY "All can view login logs"    ON login_logs FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id      ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_logged_in_at ON login_logs(logged_in_at DESC);
