-- ============================================================
-- Fix: targets SELECT policy + team hierarchy support
-- ============================================================

-- 1. Fix SELECT policy (was blocking Firebase auth users)
DROP POLICY IF EXISTS "targets_select" ON targets;
CREATE POLICY "targets_select" ON targets
  FOR SELECT USING (true);

-- 2. Add description column to targets
ALTER TABLE targets ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Add manager_id to profiles for Sales Manager → team hierarchy
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
