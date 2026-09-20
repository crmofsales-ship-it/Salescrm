-- Add temperature (Hot/Warm/Cold) to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS temperature TEXT
  CHECK (temperature IN ('hot', 'warm', 'cold'));
