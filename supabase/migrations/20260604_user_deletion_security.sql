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
