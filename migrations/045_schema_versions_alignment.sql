-- Align schema version history with shared/schema.ts.

ALTER TABLE schema_versions
  ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb;

CREATE INDEX IF NOT EXISTS schema_versions_template_id_idx ON schema_versions(template_id);
