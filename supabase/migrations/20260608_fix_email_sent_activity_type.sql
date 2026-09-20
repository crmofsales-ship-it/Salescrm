-- ============================================================
-- Fix: Add email_sent to the activities type constraint
-- The classify endpoint in email.js inserts activities with
-- type = 'email_sent', which was missing from the CHECK
-- constraint added in 20260521_activities_full_schema.sql.
-- Without this, every classify call fails with a constraint
-- violation, preventing the success popup and log entry.
-- ============================================================

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
    'followup', 'reminder', 'task', 'proposal',
    -- whatsapp types
    'whatsapp', 'whatsapp_follow_up',
    -- email sync / Gmail auto-tracking
    'email_sent'
  ));
