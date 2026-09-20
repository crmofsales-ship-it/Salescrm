-- ============================================================
-- Meetings v2 + Chat enhancements + Notifications system
-- ============================================================

-- ── MEETINGS enhancements ──────────────────────────────────────

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_purpose   VARCHAR(50),       -- discovery | demo | follow_up | negotiation | closing
  ADD COLUMN IF NOT EXISTS mode              VARCHAR(20) DEFAULT 'online', -- online | offline
  ADD COLUMN IF NOT EXISTS timezone          VARCHAR(100) DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS agenda            TEXT,
  ADD COLUMN IF NOT EXISTS talking_points    TEXT,
  ADD COLUMN IF NOT EXISTS expected_outcome  TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes    TEXT,
  ADD COLUMN IF NOT EXISTS outcome           VARCHAR(50),       -- won | positive | neutral | negative | no_show
  ADD COLUMN IF NOT EXISTS outcome_notes     TEXT,
  ADD COLUMN IF NOT EXISTS next_follow_up    DATE,
  ADD COLUMN IF NOT EXISTS lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id           UUID REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name      TEXT,
  ADD COLUMN IF NOT EXISTS jitsi_room        TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_task_created BOOLEAN DEFAULT FALSE;

-- ── CHAT enhancements ─────────────────────────────────────────

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

ALTER TABLE channel_members
  ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT FALSE;

-- ── NOTIFICATIONS system ───────────────────────────────────────

-- schema.sql may already have created a simpler notifications table — make this
-- additive so it works either way.
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,
  title         TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS body        TEXT,
  ADD COLUMN IF NOT EXISTS message     TEXT,
  ADD COLUMN IF NOT EXISTS link        TEXT,
  ADD COLUMN IF NOT EXISTS data        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entity_id   UUID,
  ADD COLUMN IF NOT EXISTS priority    VARCHAR(20) DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS read        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dismissed   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

-- Indexes for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC)
  WHERE dismissed = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(entity_type, entity_id);

-- Auto-cleanup: remove dismissed or expired notifications older than 30 days
-- (Run via a Supabase pg_cron job or manually)

-- RLS: every user sees only their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "notifications_delete" ON notifications FOR DELETE USING (true);
