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
