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
