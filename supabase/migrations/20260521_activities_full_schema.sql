-- ================================================================
-- ACTIVITIES TABLE — FULL SCHEMA PATCH
-- Run in Supabase SQL Editor
-- Adds missing columns + expands type constraint + indexes
-- ================================================================

-- 1. Add missing columns (safe — IF NOT EXISTS)
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS created_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title         TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT        DEFAULT 'done'   CHECK (status IN ('todo','done','cancelled')),
  ADD COLUMN IF NOT EXISTS priority      TEXT        DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  ADD COLUMN IF NOT EXISTS due_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS related_type  TEXT        CHECK (related_type IN ('lead','deal','customer','pipeline')),
  ADD COLUMN IF NOT EXISTS related_id    UUID,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- 2. Backfill created_by from user_id where it is null
UPDATE activities SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;

-- 3. Expand the type CHECK constraint to include all types used by the frontend
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities
  ADD CONSTRAINT activities_type_check CHECK (type IN (
    -- base types (original schema)
    'call', 'meeting', 'follow_up', 'email', 'note',
    'stage_change', 'deal_created', 'task_created', 'general',
    -- backend extras
    'visit', 'virtual_meeting', 'phone_call', 'email_contact',
    -- pipeline panel types
    'follow_up_call', 'follow_up_email', 'meeting_person', 'meeting_virtual',
    -- lead / deal panel types
    'followup', 'reminder', 'task', 'proposal'
  ));

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_created_by    ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to   ON activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activities_related       ON activities(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead_id       ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_deal_id       ON activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_activities_status        ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_due_date      ON activities(due_date);

-- 5. Ensure change_history table has required FK (safe if already exists)
ALTER TABLE change_history
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Done. Run ANALYZE to refresh query planner stats.
ANALYZE activities;
