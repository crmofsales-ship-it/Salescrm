-- Audit log for tracking sensitive actions (exports, bulk operations, etc.)
CREATE TABLE IF NOT EXISTS audit_logs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  action     text        NOT NULL,          -- 'export', 'bulk_delete', 'lock', etc.
  resource   text,                          -- 'leads', 'deals', 'pipeline'
  details    jsonb       DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Index for fast per-user lookups (audit viewer)
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);

-- RLS: all authenticated users can insert their own logs; only owner/sales_head can read
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_logs;
CREATE POLICY "Users can insert own audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::text::uuid OR user_id IN (
    SELECT id FROM profiles WHERE firebase_uid = auth.uid()::text
  ));

DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE firebase_uid = auth.uid()::text
        AND role IN ('owner', 'sales_head')
    )
  );
