-- ── Enhancement 1: store Google Maps place_id on meetings ────────────────────
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_place_id TEXT;

-- ── Enhancement 2: per-user OAuth tokens for Google Meet & Microsoft Teams ───
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider      TEXT        NOT NULL,   -- 'google_meet' | 'microsoft_teams'
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scope         TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- RLS: users can only read/write their own OAuth tokens
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_oauth_tokens_own" ON user_oauth_tokens
  USING (user_id IN (SELECT id FROM profiles WHERE firebase_uid = auth.uid()::text));
