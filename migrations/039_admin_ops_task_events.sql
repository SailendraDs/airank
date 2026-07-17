CREATE TABLE IF NOT EXISTS admin_ops_task_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar NOT NULL REFERENCES admin_ops_tasks(id) ON DELETE CASCADE,
  brand_id varchar REFERENCES brands(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  from_status text,
  to_status text,
  evidence_url text,
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_ops_task_events_task_idx ON admin_ops_task_events(task_id);
CREATE INDEX IF NOT EXISTS admin_ops_task_events_brand_idx ON admin_ops_task_events(brand_id);
CREATE INDEX IF NOT EXISTS admin_ops_task_events_type_idx ON admin_ops_task_events(event_type);
CREATE INDEX IF NOT EXISTS admin_ops_task_events_task_created_idx ON admin_ops_task_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_ops_task_events_brand_created_idx ON admin_ops_task_events(brand_id, created_at DESC);
