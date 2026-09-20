-- Per-user toggle: allow field users (employee/inside_sales) to view Team Performance
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_team_performance boolean NOT NULL DEFAULT false;
