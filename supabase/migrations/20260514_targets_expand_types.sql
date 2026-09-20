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
