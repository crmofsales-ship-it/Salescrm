-- Add priority column to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium'
  CHECK (priority IN ('high', 'medium', 'low'));
