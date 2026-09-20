-- ============================================================
-- Meetings v2: platform selector, location geo, reminder tracking
-- ============================================================

-- 1. Relax the meeting_type CHECK constraint to include Teams, Zoom, Custom
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_meeting_type_check
  CHECK (meeting_type IN ('google_meet','teams','zoom','custom','in_person'));

-- 2. Explicit platform column (mirrors meeting_type for online meetings)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_platform TEXT;

-- 3. Location geo fields (populated when Google Maps Places autocomplete is used)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_lat      NUMERIC(10,7);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_lng      NUMERIC(10,7);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_maps_url TEXT;

-- 4. Reminder tracking — prevents duplicate sends when cron fires repeatedly
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reminder_24h_sent_at  TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reminder_1h_sent_at   TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reminder_15m_sent_at  TIMESTAMPTZ;

-- Performance index for the reminder query (fetch scheduled meetings by start_time)
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_status     ON meetings(status);
