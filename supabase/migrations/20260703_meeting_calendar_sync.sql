-- Stores external calendar event IDs for CRM meetings so they can be
-- cleaned up when the meeting is deleted from the CRM.
CREATE TABLE IF NOT EXISTS meeting_calendar_sync (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id        UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL CHECK (provider IN ('google_meet', 'microsoft_teams')),
  external_event_id TEXT        NOT NULL,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (meeting_id, provider)
);

CREATE INDEX IF NOT EXISTS meeting_calendar_sync_meeting_id_idx
  ON meeting_calendar_sync (meeting_id);
