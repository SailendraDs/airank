CREATE INDEX IF NOT EXISTS admin_ops_tasks_brand_created_idx ON admin_ops_tasks(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_ops_tasks_brand_status_created_idx ON admin_ops_tasks(brand_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_ops_tasks_desk_dedupe_idx ON admin_ops_tasks(brand_id, type, source, title, status);

CREATE INDEX IF NOT EXISTS integrations_brand_idx ON integrations(brand_id);
CREATE INDEX IF NOT EXISTS integrations_brand_status_idx ON integrations(brand_id, status);
CREATE INDEX IF NOT EXISTS integrations_brand_updated_idx ON integrations(brand_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS integration_connection_events_brand_created_idx ON integration_connection_events(brand_id, created_at DESC);
