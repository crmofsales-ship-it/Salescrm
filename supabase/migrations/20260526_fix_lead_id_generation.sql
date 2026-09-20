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
