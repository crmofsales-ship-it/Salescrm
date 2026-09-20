-- ============================================================
-- Change History: audit log for field-level changes on
-- leads and deals (POC switches, stage changes, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS change_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT        NOT NULL,  -- 'lead' | 'deal'
  entity_id    UUID        NOT NULL,
  field_name   TEXT        NOT NULL,  -- 'contact_name' | 'stage' | 'temperature' | 'assigned_to' | 'value'
  field_label  TEXT,                  -- human-readable label shown in UI
  old_value    TEXT,
  new_value    TEXT,
  changed_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  note         TEXT,                  -- optional reason / comment
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_history_entity
  ON change_history (entity_type, entity_id, created_at DESC);

ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change_history_all" ON change_history
  FOR ALL USING (true) WITH CHECK (true);
