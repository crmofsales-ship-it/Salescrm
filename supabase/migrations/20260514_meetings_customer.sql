-- Add customer fields and meeting type to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'in_person' CHECK (meeting_type IN ('google_meet','teams','in_person'));
