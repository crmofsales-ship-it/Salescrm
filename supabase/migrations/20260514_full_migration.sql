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

-- ── 4. Fix targets RLS (Firebase UID ≠ Supabase auth.uid) ───
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
