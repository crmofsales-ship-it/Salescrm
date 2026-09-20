-- Per-record data locking: employee-created records are locked by default
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
