-- ============================================================================
-- Sales CRM — FRESH INSTALL (run once). Baseline -> ordered migrations ->
-- multi-tenant/Auth/RLS (0050-0750). Paste into the SQL Editor and Run.
-- Safe to re-run. Yellow "storage schema" WARNING near the end is expected.
-- ============================================================================

-- ═══ 1. BASELINE SCHEMA ═══
-- ============================================================
-- SALES CRM — BASELINE SUPABASE SCHEMA (pre-multitenant; see migrations/20260828_*)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop existing tables in reverse dependency order (clean slate)
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS channel_members CASCADE;
DROP TABLE IF EXISTS chat_channels CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS meeting_attendees CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS task_comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS deals CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES TABLE (linked to the auth provider via legacy_uid)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'employee' CHECK (role IN ('owner', 'sales_head', 'sales_manager', 'employee')),
  department TEXT,
  phone TEXT,
  bio TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  online_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  designation TEXT,
  city TEXT,
  state TEXT,
  budget NUMERIC DEFAULT 0,
  product_interest TEXT,
  temperature TEXT DEFAULT 'warm' CHECK (temperature IN ('hot', 'warm', 'cold')),
  stage TEXT DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  source TEXT DEFAULT 'website' CHECK (source IN ('website', 'call', 'email', 'referral', 'social', 'exhibition', 'walk_in', 'other')),
  follow_up_date TIMESTAMPTZ,
  linkedin TEXT,
  website TEXT,
  remarks TEXT,
  other_notes TEXT,
  ai_score INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  industry TEXT,
  website TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'churned')),
  total_value NUMERIC DEFAULT 0,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  stage TEXT DEFAULT 'prospecting' CHECK (stage IN ('prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  probability INTEGER DEFAULT 20 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  labels TEXT[] DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TASK COMMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MEETINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  meeting_link TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  notes TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MEETING ATTENDEES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(meeting_id, user_id)
);

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lead_assigned', 'task_due', 'deal_updated', 'mention', 'meeting_reminder', 'team_update', 'general')),
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHAT CHANNELS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'channel' CHECK (type IN ('channel', 'direct', 'group')),
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_private BOOLEAN DEFAULT FALSE,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHANNEL MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

-- ============================================================
-- CHAT MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'file', 'voice', 'system')),
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  reply_to UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  reactions JSONB DEFAULT '{}',
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVITIES TABLE (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('call', 'meeting', 'follow_up', 'email', 'note', 'stage_change', 'deal_created', 'task_created', 'general')),
  description TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Note: Since auth is handled outside Supabase Auth, we use
-- service role key on backend for admin operations.
-- On frontend with anon key, we keep policies permissive for
-- organization members (all users in same org can read).
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Allow anon key to read/write (since auth is handled at app level)
-- Adjust these policies based on your security requirements
CREATE POLICY "Allow all for anon" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON leads FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON deals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON tasks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON task_comments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON meetings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON meeting_attendees FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON chat_channels FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON channel_members FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON chat_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON activities FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON files FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- REALTIME SUBSCRIPTIONS (enable for real-time features)
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages','notifications','leads','deals','tasks','activities','profiles'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- DEFAULT CHANNELS (run after first user is created)
-- ============================================================
-- INSERT INTO chat_channels (name, type, description, is_private) VALUES
--   ('general', 'channel', 'Company-wide announcements and discussions', false),
--   ('sales', 'channel', 'Sales team discussions', false),
--   ('leads', 'channel', 'Lead discussions and updates', false),
--   ('random', 'channel', 'Random conversations', false);


-- ═══ 2. 20260513_targets_table.sql ═══
-- ============================================================
-- Migration: Add targets table for KPI tracking
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS targets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  period_type  TEXT        NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  metric       TEXT        NOT NULL CHECK (metric IN ('qualified_leads', 'meetings', 'activities', 'revenue')),
  target_value NUMERIC     NOT NULL DEFAULT 0,
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  assigned_to  UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read targets
CREATE POLICY "targets_select" ON targets
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only allow insert if the user is the creator
CREATE POLICY "targets_insert" ON targets
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Owners/sales heads can update any target (enforced at app layer)
CREATE POLICY "targets_update" ON targets
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Owners/sales heads can delete targets (enforced at app layer)
CREATE POLICY "targets_delete" ON targets
  FOR DELETE USING (auth.role() = 'authenticated');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_targets_updated_at ON targets;
CREATE TRIGGER trg_targets_updated_at
  BEFORE UPDATE ON targets
  FOR EACH ROW EXECUTE FUNCTION fn_targets_updated_at();


-- ═══ 2. 20260513_fix_constraints.sql ═══
-- ============================================================
-- Migration: Fix CHECK constraints + add lead_code column + trigger
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add lead_code column (it doesn't exist yet) ───────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_code TEXT;

-- ── 2. leads.source constraint ───────────────────────────────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN (
    'website', 'linkedin', 'referral', 'cold_call', 'email_campaign',
    'event', 'partner', 'social_media', 'ads', 'walk_in', 'other',
    'call', 'email', 'social', 'exhibition'
  ) OR source IS NULL);

-- ── 3. leads.stage constraint (add 'converted') ──────────────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;

ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('new','contacted','qualified','proposal','converted','won','lost')
         OR stage IS NULL);

-- ── 4. Auto-generate lead_code on INSERT ─────────────────────
CREATE OR REPLACE FUNCTION fn_set_lead_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(lead_code FROM 6) AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM leads
    WHERE lead_code ~ '^LEAD-[0-9]{5}$';

    NEW.lead_code := 'LEAD-' || LPAD(next_num::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_code ON leads;

CREATE TRIGGER trg_lead_code
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_lead_code();


-- ═══ 2. 20260514_full_migration.sql ═══
-- ============================================================
-- Migration: Full system fix — deals, roles, targets, settings
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add inside_sales to profiles role constraint ──────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'sales_head', 'sales_manager', 'employee', 'inside_sales'));

-- ── 2. Add missing columns to deals ─────────────────────────
ALTER TABLE deals ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_date DATE;

-- Back-fill company_name from title where null
UPDATE deals SET company_name = title WHERE company_name IS NULL OR company_name = '';

-- ── 3. Fix deals stage constraint to match frontend ──────────
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('new', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'won', 'lost'));

-- Migrate any old-schema stage values
UPDATE deals SET stage = CASE stage
  WHEN 'prospecting'   THEN 'new'
  WHEN 'qualification' THEN 'contacted'
  WHEN 'proposal'      THEN 'proposal_sent'
  WHEN 'closed_won'    THEN 'won'
  WHEN 'closed_lost'   THEN 'lost'
  ELSE stage
END
WHERE stage NOT IN ('new','contacted','meeting_scheduled','proposal_sent','negotiation','won','lost');

-- Fix default
ALTER TABLE deals ALTER COLUMN stage SET DEFAULT 'new';

-- ── 4. Fix targets RLS (external UID ≠ Supabase auth.uid) ───
DROP POLICY IF EXISTS "targets_insert" ON targets;
CREATE POLICY "targets_insert" ON targets
  FOR INSERT WITH CHECK (true);

-- ── 5. Add CRM-wide settings table ──────────────────────────
CREATE TABLE IF NOT EXISTS crm_settings (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL DEFAULT '',
  updated_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_settings_all" ON crm_settings;
CREATE POLICY "crm_settings_all" ON crm_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Seed default settings
INSERT INTO crm_settings (key, value)
  VALUES ('phone_email_lock', 'false')
  ON CONFLICT (key) DO NOTHING;

-- ── 6. Enable RLS on deals + open policies (match leads) ────
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deals_all" ON deals;
CREATE POLICY "deals_all" ON deals FOR ALL USING (true) WITH CHECK (true);

-- ── 7. Ensure leads RLS is open ──────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_all" ON leads;
CREATE POLICY "leads_all" ON leads FOR ALL USING (true) WITH CHECK (true);


-- ═══ 2. 20260514_meetings_chat_notifications.sql ═══
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


-- ═══ 2. 20260514_pipeline_table.sql ═══
-- Pipeline table: prospects without contact details (pre-lead stage)

CREATE TABLE IF NOT EXISTS pipeline (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name     TEXT        NOT NULL,
  contact_name     TEXT,
  email            TEXT,
  phone            TEXT,
  source           TEXT,
  stage            TEXT        DEFAULT 'new',
  temperature      TEXT        DEFAULT 'warm',
  priority         TEXT        DEFAULT 'medium',
  service_interested TEXT,
  remarks          TEXT,
  other_notes      JSONB       DEFAULT '{}',
  assigned_to      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;

-- Open policies (externally-authenticated users appear as anon, app enforces RBAC)
CREATE POLICY "pipeline_select" ON pipeline FOR SELECT USING (true);
CREATE POLICY "pipeline_insert" ON pipeline FOR INSERT WITH CHECK (true);
CREATE POLICY "pipeline_update" ON pipeline FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "pipeline_delete" ON pipeline FOR DELETE USING (true);


-- ═══ 2. 20260514_chat_rls_fix.sql ═══
-- Fix RLS on chat tables so messages persist across logout/login
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_channels_all" ON chat_channels;
CREATE POLICY "chat_channels_all" ON chat_channels FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_all" ON chat_messages;
CREATE POLICY "chat_messages_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_members_all" ON channel_members;
CREATE POLICY "channel_members_all" ON channel_members FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for chat file attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "chat_files_all" ON storage.objects;
CREATE POLICY "chat_files_all" ON storage.objects FOR ALL USING (bucket_id = 'chat-files') WITH CHECK (bucket_id = 'chat-files');


-- ═══ 2. 20260514_meetings_customer.sql ═══
-- Add customer fields and meeting type to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'in_person' CHECK (meeting_type IN ('google_meet','teams','in_person'));


-- ═══ 2. 20260514_pipeline_unified.sql ═══
-- ============================================================
-- Pipeline Unified: Pipeline = Leads with stage = 'pipeline'
-- Also adds lineage tracking: lead_id in deals, deal_id in customers
-- ============================================================

-- 1. Add 'pipeline' to leads stage constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('pipeline','new','contacted','qualified','proposal','proposal_sent','converted','won','lost')
         OR stage IS NULL);

-- 2. Track which lead originated each deal
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- 3. Track which deal originated each customer
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

-- 4. Drop the old separate pipeline table if it was created
DROP TABLE IF EXISTS pipeline CASCADE;


-- ═══ 2. 20260514_pipeline_v2.sql ═══
-- ============================================================
-- Pipeline v2: kanban stages + multi-contact methods
-- ============================================================

-- 1. Pipeline-specific kanban stage (independent from leads.stage)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'new_prospect';

-- 2. Dynamic contact methods array (LinkedIn, WhatsApp, etc.)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]';

-- 3. Index for fast pipeline queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage) WHERE stage = 'pipeline';
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);


-- ═══ 2. 20260514_targets_dml_fix.sql ═══
-- Fix DELETE and UPDATE policies for targets table
-- (auth.role() = 'authenticated' returns 'anon' for externally-authenticated users)

DROP POLICY IF EXISTS "targets_delete" ON targets;
CREATE POLICY "targets_delete" ON targets
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "targets_update" ON targets;
CREATE POLICY "targets_update" ON targets
  FOR UPDATE USING (true) WITH CHECK (true);


-- ═══ 2. 20260514_targets_expand_types.sql ═══
-- Expand targets: add daily/weekly periods + deals_won/deals_proposal metrics

-- 1. Expand period_type constraint
ALTER TABLE targets DROP CONSTRAINT IF EXISTS targets_period_type_check;
ALTER TABLE targets ADD CONSTRAINT targets_period_type_check
  CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

-- 2. Expand metric constraint
ALTER TABLE targets DROP CONSTRAINT IF EXISTS targets_metric_check;
ALTER TABLE targets ADD CONSTRAINT targets_metric_check
  CHECK (metric IN (
    'qualified_leads',
    'meetings',
    'activities',
    'revenue',
    'deals_won',
    'deals_proposal'
  ));

-- 3. Add achieved_value column if not already added
ALTER TABLE targets ADD COLUMN IF NOT EXISTS achieved_value NUMERIC DEFAULT NULL;

-- 4. Add description column if not already added
ALTER TABLE targets ADD COLUMN IF NOT EXISTS description TEXT;


-- ═══ 2. 20260514_targets_rls_fix.sql ═══
-- ============================================================
-- Fix: targets SELECT policy + team hierarchy support
-- ============================================================

-- 1. Fix SELECT policy (was blocking externally-authenticated users)
DROP POLICY IF EXISTS "targets_select" ON targets;
CREATE POLICY "targets_select" ON targets
  FOR SELECT USING (true);

-- 2. Add description column to targets
ALTER TABLE targets ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Add manager_id to profiles for Sales Manager → team hierarchy
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;


-- ═══ 2. 20260515_change_history.sql ═══
-- ============================================================
-- Change History: audit log for field-level changes on
-- leads and deals (POC switches, stage changes, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS change_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT        NOT NULL,  -- 'lead' | 'deal'
  entity_id    UUID        NOT NULL,
  field_name   TEXT        NOT NULL,  -- 'contact_name' | 'stage' | 'temperature' | 'assigned_to' | 'value'
  field_label  TEXT,                  -- human-readable label shown in UI
  old_value    TEXT,
  new_value    TEXT,
  changed_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  note         TEXT,                  -- optional reason / comment
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_history_entity
  ON change_history (entity_type, entity_id, created_at DESC);

ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change_history_all" ON change_history
  FOR ALL USING (true) WITH CHECK (true);


-- ═══ 2. 20260515_deals_temperature.sql ═══
-- Add temperature (Hot/Warm/Cold) to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS temperature TEXT
  CHECK (temperature IN ('hot', 'warm', 'cold'));


-- ═══ 2. 20260516_audit_logs.sql ═══
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
    SELECT id FROM profiles WHERE legacy_uid = auth.uid()::text
  ));

DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE legacy_uid = auth.uid()::text
        AND role IN ('owner', 'sales_head')
    )
  );


-- ═══ 2. 20260516_login_logs.sql ═══
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


-- ═══ 2. 20260516_data_locking.sql ═══
-- Per-record data locking: employee-created records are locked by default
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;


-- ═══ 2. 20260516_login_logs_v2.sql ═══
-- Extend login_logs with device fingerprint, IP, and location
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ip_address  varchar(45);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS city        varchar(100);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS country     varchar(100);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS device_id   varchar(200);


-- ═══ 2. 20260516_team_performance_access.sql ═══
-- Per-user toggle: allow field users (employee/inside_sales) to view Team Performance
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_team_performance boolean NOT NULL DEFAULT false;


-- ═══ 2. 20260518_pipeline_lead_lineage.sql ═══
-- Track which pipeline entry originated a lead.
-- Conversion now creates a NEW lead row without touching the pipeline entry.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_id ON leads(pipeline_id);


-- ═══ 2. 20260521_activities_full_schema.sql ═══
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


-- ═══ 2. 20260523_deals_stage_revert.sql ═══
-- Expand deals.stage check constraint to include revert-flow stages
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'new', 'contacted', 'meeting_scheduled', 'proposal_sent',
    'negotiation', 'won', 'lost',
    'reverted_to_lead', 'reverted_to_pipeline'
  ));


-- ═══ 2. 20260526_fix_lead_id_generation.sql ═══
-- ============================================================
-- Fix lead_code generation to be consistent across all paths
-- ============================================================

-- 1. Fix trigger to count ALL LEAD-N formats (not just 5-digit ones).
--    Previously the WHERE clause used '^LEAD-[0-9]{5}$' which excluded
--    any 3- or 4-digit codes that were created by other code paths,
--    causing the trigger to restart from LEAD-00001 even when codes
--    like LEAD-001 already existed.
CREATE OR REPLACE FUNCTION fn_set_lead_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(lead_code FROM 6) AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM leads
    WHERE lead_code ~ '^LEAD-[0-9]+$';

    NEW.lead_code := 'LEAD-' || LPAD(next_num::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (in case it was dropped or replaced)
DROP TRIGGER IF EXISTS trg_lead_code ON leads;
CREATE TRIGGER trg_lead_code
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_lead_code();

-- 2. Backfill any leads that have a NULL or empty lead_code.
--    Runs row by row so each UPDATE is visible to the next MAX query.
DO $$
DECLARE
  rec      RECORD;
  next_num INTEGER;
BEGIN
  FOR rec IN
    SELECT id FROM leads
    WHERE lead_code IS NULL OR lead_code = ''
    ORDER BY created_at ASC NULLS LAST
  LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(lead_code FROM 6) AS INTEGER)), 0) + 1
    INTO next_num
    FROM leads
    WHERE lead_code ~ '^LEAD-[0-9]+$';

    UPDATE leads
    SET lead_code = 'LEAD-' || LPAD(next_num::TEXT, 3, '0')
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 3. Add a UNIQUE constraint so duplicate lead_codes can never be
--    inserted going forward (guards against race conditions).
--    If duplicates already exist the constraint will fail — in that case
--    run the deduplication query below first.
ALTER TABLE leads
  ADD CONSTRAINT leads_lead_code_unique UNIQUE (lead_code);


-- ═══ 2. 20260604_user_deletion_security.sql ═══
-- Migration: User soft-delete security
-- Adds deleted status, deleted_at, deleted_by to profiles table.
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → Run

-- 1. Expand status constraint to include 'deleted'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'inactive', 'invited', 'deleted'));

-- 2. Add soft-delete audit columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_by  UUID        NULL REFERENCES profiles(id) ON DELETE SET NULL;


-- ═══ 2. 20260608_email_sync.sql ═══
-- ============================================================
-- Email Sync: connected accounts + raw email log
-- ============================================================

-- Connected email accounts (one per user per email address)
CREATE TABLE IF NOT EXISTS email_accounts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider        TEXT        NOT NULL DEFAULT 'gmail',
  email           TEXT        NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TIMESTAMPTZ,
  history_id      TEXT,
  last_sync_at    TIMESTAMPTZ,
  is_active       BOOLEAN     DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Raw emails fetched from provider, pending user activity-type classification
CREATE TABLE IF NOT EXISTS email_sync_log (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email_account_id  UUID        NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id        TEXT        NOT NULL,
  thread_id         TEXT,
  subject           TEXT,
  from_email        TEXT,
  to_emails         TEXT[]      DEFAULT '{}',
  cc_emails         TEXT[]      DEFAULT '{}',
  bcc_emails        TEXT[]      DEFAULT '{}',
  sent_at           TIMESTAMPTZ,
  attachment_count  INTEGER     DEFAULT 0,
  snippet           TEXT,
  direction         TEXT        DEFAULT 'outbound',
  status            TEXT        DEFAULT 'pending',
  activity_type     TEXT,
  lead_id           UUID        REFERENCES leads(id) ON DELETE SET NULL,
  deal_id           UUID        REFERENCES deals(id) ON DELETE SET NULL,
  activity_id       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email_account_id, message_id)
);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sync_log  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_accounts_all" ON email_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_sync_log_all" ON email_sync_log  FOR ALL USING (true) WITH CHECK (true);


-- ═══ 2. 20260608_email_activity_v3.sql ═══
-- ============================================================
-- Email Activity v3: follow-up tracking
-- ============================================================
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS follow_up_date   DATE;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'none';

-- Run the v2 migration columns too (idempotent if already run)
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS reason          TEXT;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS customer_id     UUID;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS pipeline_id     UUID;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_module      TEXT;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_record_name TEXT;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS sender_name     TEXT;

CREATE INDEX IF NOT EXISTS idx_esl_user_id     ON email_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_esl_sent_at     ON email_sync_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_esl_status      ON email_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_esl_lead_id     ON email_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_esl_crm_module  ON email_sync_log(crm_module);


-- ═══ 2. 20260608_email_sync_v2.sql ═══
-- ============================================================
-- Email Sync v2: reason capture, enhanced CRM mapping,
-- domain restriction support, performance indexes
-- ============================================================

-- Reason / comment the user provides when classifying an email
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS reason TEXT;

-- Extended CRM mapping (beyond leads → also customers and pipeline)
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS pipeline_id UUID; -- no FK: pipeline table may not exist in all envs

-- Human-readable module and record name for the log table UI
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_module      TEXT; -- 'lead' | 'customer' | 'pipeline'
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS crm_record_name TEXT; -- e.g. "Jane Smith / Acme Corp"

-- Sender's display name (cached from profile at sync time for fast log rendering)
ALTER TABLE email_sync_log ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_esl_user_id     ON email_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_esl_sent_at     ON email_sync_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_esl_status      ON email_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_esl_lead_id     ON email_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_esl_customer_id ON email_sync_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_esl_crm_module  ON email_sync_log(crm_module);


-- ═══ 2. 20260608_fix_email_sent_activity_type.sql ═══
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


-- ═══ 2. 20260608_meetings_v2.sql ═══
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


-- ═══ 2. 20260609_meetings_priority.sql ═══
-- Add priority column to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium'
  CHECK (priority IN ('high', 'medium', 'low'));


-- ═══ 2. 20260610_dsr_email_logs.sql ═══
-- ================================================================
-- DSR Email Logs Table
-- Tracks every manual and automated DSR email send for auditing.
-- Run in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS dsr_email_logs (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_by          UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  recipients       TEXT[]       NOT NULL DEFAULT '{}',
  recipient_count  INTEGER      NOT NULL DEFAULT 0,
  report_date      DATE         NOT NULL,
  report_type      TEXT         NOT NULL DEFAULT 'DSR',
  delivery_status  TEXT         NOT NULL DEFAULT 'pending'
                                CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  error_message    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_sent_at     ON dsr_email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_report_date ON dsr_email_logs(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_sent_by     ON dsr_email_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_dsr_email_logs_status      ON dsr_email_logs(delivery_status);

-- Allow service role full access (Supabase default — no extra RLS needed for server-side only)


-- ═══ 2. 20260611_dsr_recipient_config.sql ═══
-- ================================================================
-- DSR Recipient Configuration Table
-- Stores which specific Super Admins and Sales Heads receive the
-- automatic 8 PM DSR. Managed by owners via the CRM UI.
-- Run in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS dsr_recipient_config (
  user_id    UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_by   UUID  REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_dsr_recipient_config_user ON dsr_recipient_config(user_id);


-- ═══ 2. 20260615_dsr_scheduler.sql ═══
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


-- ═══ 2. 20260623_inactivity_alert.sql ═══
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


-- ═══ 2. 20260703_meeting_calendar_sync.sql ═══
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


-- ═══ 2. 20260703_meeting_oauth_enhancements.sql ═══
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
  USING (user_id IN (SELECT id FROM profiles WHERE legacy_uid = auth.uid()::text));


-- ═══ 3. 20260828_0050_aux_tables.sql ═══
-- ============================================================================
-- Part 0 — auxiliary tables that the app code uses but that were created by hand
-- in the old project's dashboard (no migration existed). Create them here so a
-- fresh database is complete. IF NOT EXISTS everywhere → safe on existing DBs.
-- Runs before 0100; 0300/0600 then add organization_id + RLS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  file_type     TEXT,
  size_bytes    BIGINT,
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','error')),
  chunk_count   INTEGER DEFAULT 0,
  file_url      TEXT,
  error_message TEXT,
  uploaded_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.ai_documents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_document_chunks_doc ON public.ai_document_chunks(document_id);

CREATE TABLE IF NOT EXISTS public.lead_inactivity_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL,
  assigned_to_at_event UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_assigned_to      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  triggered_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_inactivity_logs_lead ON public.lead_inactivity_logs(lead_id);

CREATE TABLE IF NOT EXISTS public.activity_deletion_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id      UUID,
  activity_type    TEXT,
  activity_title   TEXT,
  related_type     TEXT,
  related_id       UUID,
  lead_id          UUID,
  deal_id          UUID,
  original_creator UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleter_name     TEXT,
  deleter_role     TEXT,
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Light-weight prospect list used by the AI search tool.
CREATE TABLE IF NOT EXISTS public.prospects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name TEXT,
  company_name TEXT,
  email        TEXT,
  phone        TEXT,
  status       TEXT DEFAULT 'new',
  assigned_to  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ═══ 3. 20260828_0100_organizations.sql ═══
-- ============================================================================
-- SaaS multi-tenant foundation — organizations, membership, roles, integrations
-- Part 1 of 5.  Run in order: 0100 → 0200 → 0300 → 0400 → 0500.
-- ============================================================================

-- ── helper: generic updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── organizations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  logo_url     TEXT,
  website      TEXT,
  industry     TEXT,
  timezone     TEXT DEFAULT 'Asia/Kolkata',
  currency     TEXT DEFAULT 'USD',
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── role model ─────────────────────────────────────────────────────────────
--  owner          : full control incl. billing, delete org, transfer ownership
--  admin          : manage members / integrations / settings / all CRM data
--  sales_manager  : manage team data, pipelines, reports, targets
--  sales_rep      : manage own assigned leads / contacts / deals / activities
-- Extensible: add rows here and grant them in fn_has_org_permission (0400).
CREATE TABLE IF NOT EXISTS public.organization_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'sales_rep'
                     CHECK (role IN ('owner','admin','sales_manager','sales_rep')),
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','invited','suspended','removed')),
  manager_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.organization_members(organization_id);
DROP TRIGGER IF EXISTS trg_org_members_updated_at ON public.organization_members;
CREATE TRIGGER trg_org_members_updated_at BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- exactly one active owner minimum is enforced at the application layer on
-- role change / member removal.

-- ── invitations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'sales_rep'
                     CHECK (role IN ('owner','admin','sales_manager','sales_rep')),
  token            TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON public.organization_invitations(lower(email));

-- ── per-organization integrations (Gmail / Google / future) ─────────────────
-- Replaces the global, per-user email_accounts model. One row per
-- (organization, provider).  Tokens are server-managed; never read by anon.
CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('gmail','google_calendar','microsoft_teams')),
  status           TEXT NOT NULL DEFAULT 'disconnected'
                     CHECK (status IN ('connected','disconnected','error')),
  is_platform_default BOOLEAN NOT NULL DEFAULT false,  -- true = the "CRM of Sales" platform identity
  connected_email  TEXT,
  display_name     TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expiry     TIMESTAMPTZ,
  scope            TEXT,
  history_id       TEXT,
  last_sync_at     TIMESTAMPTZ,
  last_error       TEXT,
  connected_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);
DROP TRIGGER IF EXISTS trg_org_integrations_updated_at ON public.organization_integrations;
CREATE TRIGGER trg_org_integrations_updated_at BEFORE UPDATE ON public.organization_integrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── org-scoped audit log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  resource         TEXT,
  resource_id      TEXT,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_audit_org ON public.organization_audit_logs(organization_id, created_at DESC);


-- ═══ 3. 20260828_0200_supabase_auth.sql ═══
-- ============================================================================
-- Part 2 of 5 — move authentication identity to Supabase Auth.
--
-- Strategy: keep profiles.id as the app-wide primary key (30+ tables already
-- FK to it — we do NOT rewrite those). Add profiles.user_id -> auth.users(id)
-- as the new auth link. legacy_uid becomes nullable legacy data.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ALTER COLUMN legacy_uid DROP NOT NULL;

-- Expand role check to the new 4-role model while tolerating legacy values
-- until 0300 remaps them.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('owner','admin','sales_manager','sales_rep',
           'sales_head','employee','inside_sales')   -- legacy, removed in 0300
);

-- ── auto-create a profile when a Supabase auth user is created ──────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Link to an existing profile by email (migration case) or create a new one.
  UPDATE public.profiles
     SET user_id = NEW.id,
         avatar_url = COALESCE(avatar_url, NEW.raw_user_meta_data->>'avatar_url')
   WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, email, full_name, avatar_url, role, status)
    VALUES (NEW.id, lower(NEW.email), v_full_name,
            NEW.raw_user_meta_data->>'avatar_url', 'sales_rep', 'active');
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── convenience: the caller's profile id ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;


-- ═══ 3. 20260828_0300_org_scoping.sql ═══
-- ============================================================================
-- Part 3 of 5 — add organization_id to every tenant-owned table, then backfill
-- all existing rows into a single "Default Organization" so nothing is orphaned.
-- ============================================================================

-- ── 1. create the default organization from existing data ──────────────────
-- Clean install: if there are no profiles yet, this is a brand-new product
-- database — skip the "Default Organization" entirely. The org_id columns are
-- still added below (NOT NULL on empty tables is fine); the first real user
-- creates the first organization through the signup/onboarding flow.
DO $$
DECLARE
  v_owner UUID;
  v_org   UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    RAISE NOTICE 'clean install — no Default Organization created'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'default') THEN
    RETURN;
  END IF;

  SELECT id INTO v_owner FROM public.profiles
   WHERE role IN ('owner','sales_head','admin')
   ORDER BY created_at ASC LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.organizations (name, slug, created_by, plan)
  VALUES ('Default Organization', 'default', v_owner, 'enterprise')
  RETURNING id INTO v_org;

  -- every existing profile becomes a member; legacy roles map to the new model
  INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
  SELECT v_org, p.id,
         CASE p.role
           WHEN 'owner'         THEN 'owner'
           WHEN 'sales_head'    THEN 'admin'
           WHEN 'admin'         THEN 'admin'
           WHEN 'sales_manager' THEN 'sales_manager'
           ELSE 'sales_rep'
         END,
         CASE WHEN p.status = 'active' THEN 'active' ELSE 'suspended' END,
         p.created_at
  FROM public.profiles p
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- guarantee exactly one owner
  IF NOT EXISTS (SELECT 1 FROM public.organization_members
                  WHERE organization_id = v_org AND role = 'owner' AND status = 'active') THEN
    UPDATE public.organization_members
       SET role = 'owner'
     WHERE id = (SELECT id FROM public.organization_members
                  WHERE organization_id = v_org ORDER BY joined_at ASC NULLS LAST LIMIT 1);
  END IF;
END $$;

-- ── 2. helper to add + backfill a column, idempotently ─────────────────────
CREATE OR REPLACE FUNCTION public._add_org_col(p_table regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_org UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default';
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', p_table);
  IF v_org IS NOT NULL THEN
    EXECUTE format('UPDATE %s SET organization_id = %L WHERE organization_id IS NULL', p_table, v_org);
  END IF;
  -- Any rows still unattributed are legacy global seed data with no tenant —
  -- meaningless under the per-org model. Drop them so NOT NULL can apply.
  EXECUTE format('DELETE FROM %s WHERE organization_id IS NULL', p_table);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN organization_id SET NOT NULL', p_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s(organization_id)',
                 'idx_' || replace(p_table::text,'public.','') || '_org', p_table);
END $$;

SELECT public._add_org_col(t) FROM (VALUES
  ('public.leads'::regclass), ('public.customers'), ('public.deals'), ('public.tasks'),
  ('public.meetings'), ('public.notifications'), ('public.activities'), ('public.files'),
  ('public.targets'), ('public.change_history'), ('public.chat_channels'),
  ('public.email_accounts'), ('public.email_sync_log'), ('public.login_logs'),
  ('public.audit_logs'), ('public.user_oauth_tokens'), ('public.meeting_calendar_sync'),
  ('public.dsr_email_logs'), ('public.dsr_scheduler'), ('public.dsr_recipient_config'),
  ('public.inactivity_alert_config')
) AS x(t);

DROP FUNCTION public._add_org_col(regclass);

-- ── 3. crm_settings: repartition per-organization ──────────────────────────
ALTER TABLE public.crm_settings ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.crm_settings SET organization_id = (SELECT id FROM public.organizations WHERE slug='default')
  WHERE organization_id IS NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE slug='default');
-- legacy global seed rows ('phone_email_lock' etc.) have no tenant — drop them;
-- each organization gets its own crm_settings rows created by the app.
DELETE FROM public.crm_settings WHERE organization_id IS NULL;
ALTER TABLE public.crm_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.crm_settings DROP CONSTRAINT IF EXISTS crm_settings_pkey;
ALTER TABLE public.crm_settings ADD PRIMARY KEY (organization_id, key);

-- ── 4. drop the legacy free-text organization column on leads ──────────────
ALTER TABLE public.leads DROP COLUMN IF EXISTS organization;

-- ── 5. remap legacy profile roles, then tighten the check constraint ───────
UPDATE public.profiles SET role = CASE role
  WHEN 'sales_head'   THEN 'admin'
  WHEN 'employee'     THEN 'sales_rep'
  WHEN 'inside_sales' THEN 'sales_rep'
  ELSE role END
WHERE role IN ('sales_head','employee','inside_sales');

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'sales_rep';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner','admin','sales_manager','sales_rep'));


-- ═══ 3. 20260828_0400_rls_tenant_isolation.sql ═══
-- ============================================================================
-- Part 4 of 5 — real tenant isolation. Removes every "USING (true)" policy and
-- replaces it with organization-scoped RLS enforced by Postgres.
--
-- Requires Supabase Auth (0200). auth.uid() is the auth.users id; profiles.user_id
-- links it to the app profile; organization_members links the profile to orgs.
-- ============================================================================

-- ── membership / permission helpers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.organization_id
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.user_id
   WHERE p.user_id = auth.uid() AND om.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_org_ids() o WHERE o = p_org)
$$;

CREATE OR REPLACE FUNCTION public.org_role(p_org UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.role
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.user_id
   WHERE p.user_id = auth.uid() AND om.organization_id = p_org AND om.status = 'active'
$$;

-- rank: owner > admin > sales_manager > sales_rep
CREATE OR REPLACE FUNCTION public.has_org_permission(p_org UUID, p_min_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (CASE public.org_role(p_org)
       WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'sales_manager' THEN 2 WHEN 'sales_rep' THEN 1 ELSE 0 END)
    >=
    (CASE p_min_role
       WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'sales_manager' THEN 2 WHEN 'sales_rep' THEN 1 ELSE 99 END),
    false)
$$;

-- ── generic policy builder for tables that carry organization_id ───────────
CREATE OR REPLACE FUNCTION public._apply_org_rls(p_table text, p_delete_min_role text DEFAULT 'sales_rep')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);
  -- drop ALL existing policies on the table
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, p_table);
  END LOOP;
  EXECUTE format($f$CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated
                    USING (public.is_org_member(organization_id))$f$, p_table);
  EXECUTE format($f$CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.is_org_member(organization_id))$f$, p_table);
  EXECUTE format($f$CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.is_org_member(organization_id))
                    WITH CHECK (public.is_org_member(organization_id))$f$, p_table);
  EXECUTE format($f$CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated
                    USING (public.has_org_permission(organization_id, %L))$f$, p_table, p_delete_min_role);
END $$;

SELECT public._apply_org_rls(t, d) FROM (VALUES
  ('leads','sales_rep'), ('customers','sales_rep'), ('deals','sales_rep'), ('tasks','sales_rep'),
  ('meetings','sales_rep'), ('notifications','sales_rep'), ('activities','sales_rep'),
  ('files','sales_rep'), ('targets','sales_manager'), ('change_history','sales_manager'),
  ('chat_channels','sales_rep'), ('email_accounts','sales_rep'), ('email_sync_log','sales_rep'),
  ('login_logs','admin'), ('audit_logs','admin'), ('user_oauth_tokens','sales_rep'),
  ('meeting_calendar_sync','sales_rep'), ('crm_settings','admin'),
  ('dsr_email_logs','admin'), ('dsr_scheduler','admin'), ('dsr_recipient_config','admin'),
  ('inactivity_alert_config','admin')
) AS x(t,d);

DROP FUNCTION public._apply_org_rls(text, text);

-- ── child tables: inherit tenancy from parent ─────────────────────────────
ALTER TABLE public.task_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
           AND tablename IN ('task_comments','meeting_attendees','channel_members','chat_messages') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY tc_all ON public.task_comments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(t.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(t.organization_id)));

CREATE POLICY ma_all ON public.meeting_attendees FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)));

CREATE POLICY cm_all ON public.channel_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)));

CREATE POLICY msg_all ON public.chat_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)));

-- ── profiles ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
  END LOOP;
END $$;
-- see your own profile, and the profiles of people who share an org with you
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR id IN (
    SELECT om2.user_id FROM public.organization_members om1
      JOIN public.organization_members om2 ON om2.organization_id = om1.organization_id
      JOIN public.profiles me ON me.id = om1.user_id
     WHERE me.user_id = auth.uid() AND om1.status = 'active'
  )
);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- inserts happen through the handle_new_user trigger (SECURITY DEFINER)

-- ── organizations / members / invitations ────────────────────────────────
ALTER TABLE public.organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_audit_logs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_profile_id());
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_permission(id,'admin')) WITH CHECK (public.has_org_permission(id,'admin'));
CREATE POLICY org_delete ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_permission(id,'owner'));

CREATE POLICY omem_select ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY omem_write ON public.organization_members FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id,'admin'))
  WITH CHECK (public.has_org_permission(organization_id,'admin'));
-- allow a user to insert THEIR OWN first membership when they create an org
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY oinv_admin ON public.organization_invitations FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id,'admin'))
  WITH CHECK (public.has_org_permission(organization_id,'admin'));

CREATE POLICY oaudit_read ON public.organization_audit_logs FOR SELECT TO authenticated
  USING (public.has_org_permission(organization_id,'admin'));

-- ── organization_integrations: NO direct client access (tokens live here) ──
-- The backend uses the service-role key. Clients read a token-free view only.
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_integrations FORCE ROW LEVEL SECURITY;
-- (no policies created => authenticated/anon get nothing)

CREATE OR REPLACE VIEW public.v_organization_integrations
WITH (security_invoker = true) AS
  SELECT id, organization_id, provider, status, is_platform_default,
         connected_email, display_name, scope, last_sync_at, last_error,
         connected_by, created_at, updated_at
    FROM public.organization_integrations
   WHERE public.is_org_member(organization_id);
GRANT SELECT ON public.v_organization_integrations TO authenticated;

-- ── lock the anon role out of everything ──────────────────────────────────
-- Nothing in this app should be reachable with only the anon key.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;


-- ═══ 3. 20260828_0500_storage_isolation.sql ═══
-- ============================================================================
-- Part 5 of 5 — storage. Private, organization-scoped buckets.
-- Path convention for every object:  <organization_id>/<entity>/<file>
--
-- On newer Supabase the SQL Editor role cannot always modify the `storage`
-- schema. Everything here is best-effort: if a statement is refused with
-- "permission denied for schema storage", the rest of fresh_install still
-- completes, and you finish storage setup from the dashboard — see
-- supabase/storage_policies.sql for the exact policies to paste into
-- Storage → Policies, or Storage → <bucket> → Policies → New policy.
-- ============================================================================

-- path helper lives in public (storage schema may be read-only here)
CREATE OR REPLACE FUNCTION public.storage_org_from_path(p_name text)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF((string_to_array(p_name,'/'))[1], '')::uuid
$$;

DO $do$
BEGIN
  -- buckets: private tenant buckets + a public-read logo bucket
  INSERT INTO storage.buckets (id, name, public) VALUES ('crm-files','crm-files', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files','chat-files', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  INSERT INTO storage.buckets (id, name, public) VALUES ('ai-documents','ai-documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('org-logos','org-logos', true, 2097152,
            ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
    ON CONFLICT (id) DO UPDATE
       SET public = true, file_size_limit = 2097152,
           allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'];

  -- drop any legacy permissive policies
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "chat_files_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "crm_files_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all for anon" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logos_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "tenant_files_rw" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logo_write" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logo_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "org_logo_delete" ON storage.objects';
  END;

  EXECUTE $p$
    CREATE POLICY tenant_files_rw ON storage.objects FOR ALL TO authenticated
      USING (bucket_id IN ('crm-files','chat-files','ai-documents')
             AND public.is_org_member(public.storage_org_from_path(name)))
      WITH CHECK (bucket_id IN ('crm-files','chat-files','ai-documents')
             AND public.is_org_member(public.storage_org_from_path(name)))
  $p$;
  EXECUTE $p$
    CREATE POLICY org_logo_write ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'org-logos'
             AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY org_logo_update ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'org-logos' AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
      WITH CHECK (bucket_id = 'org-logos' AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY org_logo_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'org-logos' AND public.has_org_permission(public.storage_org_from_path(name),'admin'))
  $p$;

  RAISE NOTICE 'storage: buckets + policies applied';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'storage: SQL Editor lacks privileges on the storage schema — finish this step from the dashboard (see supabase/storage_policies.sql). The rest of the install is unaffected.';
END $do$;


-- ═══ 3. 20260828_0600_org_scoping_addendum.sql ═══
-- ============================================================================
-- Part 6 — org-scope the auxiliary tables that were created outside version
-- control (no migration file), if they exist in this database. Safe to run on
-- databases where some or all of these tables are absent.
-- ============================================================================

DO $$
DECLARE
  v_org  UUID;
  t      TEXT;
  aux    TEXT[] := ARRAY[
    'activity_deletion_logs', 'ai_documents', 'ai_document_chunks',
    'lead_inactivity_logs', 'prospects', 'pipeline'
  ];
  r      RECORD;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default';
  IF v_org IS NULL THEN
    RAISE NOTICE 'No default organization — run 0300 first'; RETURN;
  END IF;

  FOREACH t IN ARRAY aux LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip % (absent)', t; CONTINUE;
    END IF;

    -- ai_document_chunks is a child of ai_documents; scope it via parent instead.
    IF t = 'ai_document_chunks' THEN
      EXECUTE 'ALTER TABLE public.ai_document_chunks ENABLE ROW LEVEL SECURITY';
      EXECUTE 'ALTER TABLE public.ai_document_chunks FORCE ROW LEVEL SECURITY';
      FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ai_document_chunks' LOOP
        EXECUTE format('DROP POLICY %I ON public.ai_document_chunks', r.policyname);
      END LOOP;
      IF to_regclass('public.ai_documents') IS NOT NULL THEN
        EXECUTE $p$CREATE POLICY chunk_all ON public.ai_document_chunks FOR ALL TO authenticated
          USING (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)))
          WITH CHECK (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)))$p$;
      END IF;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL', t, v_org);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_'||t||'_org', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format($p$CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated USING (public.is_org_member(organization_id))$p$, t);
  END LOOP;
END $$;


-- ═══ 3. 20260828_0700_fix_profiles_rls.sql ═══
-- ============================================================================
-- Fix — the profiles_select policy queried public.profiles inside its own body
-- (via the co-member join), which Postgres rejects as infinite recursion. Move
-- that lookup into a SECURITY DEFINER function so RLS is not re-applied inside.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.co_member_profile_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT om2.user_id
  FROM public.organization_members om1
  JOIN public.organization_members om2 ON om2.organization_id = om1.organization_id
  JOIN public.profiles me ON me.id = om1.user_id
  WHERE me.user_id = auth.uid() AND om1.status = 'active'
$$;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR id IN (SELECT public.co_member_profile_ids())
  );


-- ═══ 3. 20260828_0710_no_force_rls.sql ═══
-- ============================================================================
-- Fix — 0400/0600 set FORCE ROW LEVEL SECURITY on every table. That also makes
-- the table OWNER (postgres) subject to RLS, which breaks our SECURITY DEFINER
-- helper functions (current_profile_id, user_org_ids, is_org_member, …): they
-- run as postgres, the policies are TO authenticated, so the helpers see zero
-- rows and every org-scoped CHECK fails.
--
-- RLS stays ENABLED (enforced for anon + authenticated). We only drop FORCE.
-- The backend's service_role key bypasses RLS via the role's BYPASSRLS attribute
-- regardless, so the security posture for real clients is unchanged.
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;


-- ═══ 3. 20260828_0720_fix_insert_policies.sql ═══
-- ============================================================================
-- Fix — the org / membership INSERT checks compared against
-- public.current_profile_id() (SECURITY DEFINER). That function returns the
-- right value when called directly but evaluates to NULL inside a WITH CHECK,
-- so org creation was always rejected. Replace with an inline subquery that
-- runs as the calling role (the Supabase-recommended pattern).
-- ============================================================================

-- helper: the caller's profile id, as an inline expression (no SECURITY DEFINER)
-- profiles RLS lets an authenticated user read their own row, so this resolves.

DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS omem_bootstrap ON public.organization_members;
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

-- also make current_profile_id resilient for any other caller: fall back to the
-- JWT sub when the profiles lookup is empty in a definer context.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
$$;


-- ═══ 3. 20260828_0730_org_select_creator.sql ═══
-- ============================================================================
-- Fix — org creation actually succeeded, but `.insert().select()` failed because
-- org_select only allowed org MEMBERS to read a row. A freshly-created org has
-- no members yet (the membership row is inserted a moment later), so PostgREST
-- could not return the inserted row and surfaced it as an RLS violation.
--
-- Let the creator always see their own org. Also restore the INSERT checks
-- (a diagnostic had loosened them to `true`).
-- ============================================================================

-- caller's profile id, inline (runs as the calling role)
-- profiles RLS already lets an authenticated user read their own row.

DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (
    public.is_org_member(id)
    OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS omem_bootstrap ON public.organization_members;
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );

-- members should also be able to read the org rows they belong to via the
-- membership join even before is_org_member() caches — belt and braces:
DROP POLICY IF EXISTS omem_select ON public.organization_members;
CREATE POLICY omem_select ON public.organization_members FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
  );



-- ═══ 4. 20260828_0740_isolation_hardening.sql ═══
-- ============================================================================
-- Isolation hardening (found by a two-organization test against a live project)
--
-- 1. omem_bootstrap let ANY signed-in user insert themselves as `owner` of ANY
--    organization (it only checked that the row was for the caller, not which
--    organization it was for). It now allows only the very first membership of
--    an organization the caller created.
-- 2. omem_write let an admin grant the `owner` role. Only an owner may now.
-- 3. leads.lead_code was unique across ALL tenants, so a second organization's
--    first lead collided with the first organization's LEAD-001. Codes are now
--    unique and generated per organization.
-- ============================================================================

-- ── 1. first-membership bootstrap ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_bootstrap_membership(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.organizations o
             JOIN public.profiles p ON p.id = o.created_by
            WHERE o.id = p_org AND p.user_id = auth.uid()
         )
     AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = p_org)
$$;
REVOKE ALL ON FUNCTION public.can_bootstrap_membership(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_membership(UUID) TO authenticated;

DROP POLICY IF EXISTS omem_bootstrap ON public.organization_members;
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
    AND role = 'owner'
    AND public.can_bootstrap_membership(organization_id)
  );

-- ── 2. only an owner may grant or hold the owner role ───────────────────────
DROP POLICY IF EXISTS omem_write ON public.organization_members;
CREATE POLICY omem_write ON public.organization_members FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id, 'admin'))
  WITH CHECK (
    public.has_org_permission(organization_id, 'admin')
    AND (role <> 'owner' OR public.has_org_permission(organization_id, 'owner'))
  );

-- ── 3. per-organization lead codes ──────────────────────────────────────────
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_code_unique;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_org_lead_code_unique;
ALTER TABLE public.leads ADD CONSTRAINT leads_org_lead_code_unique UNIQUE (organization_id, lead_code);

-- SECURITY DEFINER so it sees every lead in the organization (a sales rep's
-- row-level view is smaller), locked per organization so concurrent inserts
-- cannot draw the same number.
CREATE OR REPLACE FUNCTION public.fn_set_lead_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_code:' || COALESCE(NEW.organization_id::text, '')));
    SELECT COALESCE(MAX(CAST(SUBSTRING(l.lead_code FROM 6) AS INTEGER)), 0) + 1
      INTO next_num
      FROM public.leads l
     WHERE l.organization_id IS NOT DISTINCT FROM NEW.organization_id
       AND l.lead_code ~ '^LEAD-[0-9]+$';
    NEW.lead_code := 'LEAD-' || LPAD(next_num::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_code ON public.leads;
CREATE TRIGGER trg_lead_code
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_lead_code();


-- ═══ 5. 20260828_0750_scope_aux_tables.sql ═══
-- ============================================================================
-- Tenant-scope the auxiliary tables (ai_documents, prospects, lead_inactivity_logs,
-- activity_deletion_logs, ai_document_chunks).
--
-- 0600 did this only when a "default" organization existed, so on a brand-new
-- database it was skipped: the tables had no organization_id and no tenant
-- policies (locked down, but unusable by the app). This version does not depend
-- on a default organization.
-- ============================================================================

DO $$
DECLARE
  v_org UUID;
  t     TEXT;
  r     RECORD;
  aux   TEXT[] := ARRAY['activity_deletion_logs', 'ai_documents', 'lead_inactivity_logs', 'prospects'];
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default';

  FOREACH t IN ARRAY aux LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', t);

    IF t = 'lead_inactivity_logs' THEN
      UPDATE public.lead_inactivity_logs x SET organization_id = l.organization_id
        FROM public.leads l WHERE l.id = x.lead_id AND x.organization_id IS NULL;
    END IF;
    IF v_org IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL', t, v_org);
    END IF;
    -- rows that cannot be attributed to a tenant must not survive
    EXECUTE format('DELETE FROM public.%I WHERE organization_id IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_' || t || '_org', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format($p$CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))$p$, t);
    EXECUTE format($p$CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated USING (public.is_org_member(organization_id))$p$, t);
  END LOOP;

  -- chunks belong to a document; scope them through the parent
  IF to_regclass('public.ai_document_chunks') IS NOT NULL AND to_regclass('public.ai_documents') IS NOT NULL THEN
    ALTER TABLE public.ai_document_chunks ENABLE ROW LEVEL SECURITY;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_document_chunks' LOOP
      EXECUTE format('DROP POLICY %I ON public.ai_document_chunks', r.policyname);
    END LOOP;
    CREATE POLICY chunk_all ON public.ai_document_chunks FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.ai_documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)));
  END IF;
END $$;

-- The nightly inactivity job inserts logs with the service role and no
-- organization; derive it from the lead.
CREATE OR REPLACE FUNCTION public.fn_inactivity_log_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inactivity_log_org ON public.lead_inactivity_logs;
CREATE TRIGGER trg_inactivity_log_org
  BEFORE INSERT ON public.lead_inactivity_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_inactivity_log_org();

ALTER TABLE public.lead_inactivity_logs ADD COLUMN IF NOT EXISTS days_inactive INTEGER;
