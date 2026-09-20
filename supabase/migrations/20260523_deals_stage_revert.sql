-- Expand deals.stage check constraint to include revert-flow stages
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'new', 'contacted', 'meeting_scheduled', 'proposal_sent',
    'negotiation', 'won', 'lost',
    'reverted_to_lead', 'reverted_to_pipeline'
  ));
