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
