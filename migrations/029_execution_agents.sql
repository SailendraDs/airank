-- Migration 029: Execution agents + CMS connections (Epic D)

CREATE TABLE IF NOT EXISTS cms_connections (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform varchar NOT NULL,
  name text,
  config jsonb NOT NULL,
  status varchar NOT NULL DEFAULT 'active',
  last_error text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cms_connections_brand_idx ON cms_connections (brand_id);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  agent_type varchar NOT NULL,
  title text,
  status varchar NOT NULL DEFAULT 'draft',
  input jsonb,
  output jsonb,
  target_connection_id varchar REFERENCES cms_connections(id) ON DELETE SET NULL,
  publish_result jsonb,
  error text,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  approved_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_tasks_brand_idx ON agent_tasks (brand_id);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks (status);
