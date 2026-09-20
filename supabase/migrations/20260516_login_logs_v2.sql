-- Extend login_logs with device fingerprint, IP, and location
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ip_address  varchar(45);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS city        varchar(100);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS country     varchar(100);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS device_id   varchar(200);
