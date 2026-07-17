CREATE TABLE IF NOT EXISTS feature_entitlements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id varchar NOT NULL REFERENCES plan_capabilities(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  limit_value integer,
  reset_period text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_entitlements_plan_idx ON feature_entitlements(plan_id);
CREATE INDEX IF NOT EXISTS feature_entitlements_key_idx ON feature_entitlements(feature_key);
CREATE UNIQUE INDEX IF NOT EXISTS feature_entitlements_plan_key_idx ON feature_entitlements(plan_id, feature_key);

CREATE TABLE IF NOT EXISTS brand_feature_overrides (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  limit_value integer,
  expires_at timestamp,
  reason text,
  granted_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_feature_overrides_brand_idx ON brand_feature_overrides(brand_id);
CREATE INDEX IF NOT EXISTS brand_feature_overrides_key_idx ON brand_feature_overrides(feature_key);
CREATE UNIQUE INDEX IF NOT EXISTS brand_feature_overrides_brand_key_idx ON brand_feature_overrides(brand_id, feature_key);

CREATE TABLE IF NOT EXISTS admin_ops_tasks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar REFERENCES brands(id) ON DELETE SET NULL,
  title text NOT NULL,
  type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamp,
  client_visible_status text,
  internal_notes text,
  client_notes text,
  checklist_items jsonb DEFAULT '[]'::jsonb,
  evidence_required boolean NOT NULL DEFAULT true,
  evidence_url text,
  related_action_id varchar,
  related_verification_task_id varchar,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_ops_tasks_brand_idx ON admin_ops_tasks(brand_id);
CREATE INDEX IF NOT EXISTS admin_ops_tasks_status_idx ON admin_ops_tasks(status);
CREATE INDEX IF NOT EXISTS admin_ops_tasks_type_idx ON admin_ops_tasks(type);
CREATE INDEX IF NOT EXISTS admin_ops_tasks_priority_idx ON admin_ops_tasks(priority);

CREATE TABLE IF NOT EXISTS integration_connection_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  scopes text[],
  message text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_connection_events_brand_idx ON integration_connection_events(brand_id);
CREATE INDEX IF NOT EXISTS integration_connection_events_platform_idx ON integration_connection_events(platform);

INSERT INTO feature_entitlements (plan_id, feature_key, enabled)
SELECT plan_id, feature_key, enabled
FROM (
  VALUES
    ('free','agent_readiness_full',false),
    ('free','schema_fix_pack',false),
    ('free','product_readiness',false),
    ('free','product_catalog_import',false),
    ('free','product_sampling',false),
    ('free','query_fanout',false),
    ('free','axp_drafts',false),
    ('free','axp_publish',false),
    ('free','verification_workflow',false),
    ('free','competitive_parity',false),
    ('free','production_audit',false),
    ('free','launch_blocker_pack',false),
    ('free','agent_analytics',false),
    ('free','manual_attribution',false),
    ('free','ga4_oauth',false),
    ('free','gsc_oauth',false),
    ('free','social_x',false),
    ('free','social_instagram',false),
    ('free','social_youtube',false),
    ('free','scheduled_reports',false),
    ('free','alerts',false),
    ('free','api_access',false),
    ('free','white_label_reports',false),
    ('free','admin_assisted_execution',false),
    ('starter','agent_readiness_full',true),
    ('starter','schema_fix_pack',true),
    ('starter','product_readiness',true),
    ('starter','product_catalog_import',true),
    ('starter','product_sampling',false),
    ('starter','query_fanout',true),
    ('starter','axp_drafts',true),
    ('starter','axp_publish',false),
    ('starter','verification_workflow',true),
    ('starter','competitive_parity',false),
    ('starter','production_audit',false),
    ('starter','launch_blocker_pack',false),
    ('starter','agent_analytics',true),
    ('starter','manual_attribution',true),
    ('starter','ga4_oauth',true),
    ('starter','gsc_oauth',true),
    ('starter','social_x',true),
    ('starter','social_instagram',true),
    ('starter','social_youtube',true),
    ('starter','scheduled_reports',false),
    ('starter','alerts',true),
    ('starter','api_access',false),
    ('starter','white_label_reports',false),
    ('starter','admin_assisted_execution',false),
    ('growth','agent_readiness_full',true),
    ('growth','schema_fix_pack',true),
    ('growth','product_readiness',true),
    ('growth','product_catalog_import',true),
    ('growth','product_sampling',true),
    ('growth','query_fanout',true),
    ('growth','axp_drafts',true),
    ('growth','axp_publish',true),
    ('growth','verification_workflow',true),
    ('growth','competitive_parity',true),
    ('growth','production_audit',true),
    ('growth','launch_blocker_pack',true),
    ('growth','agent_analytics',true),
    ('growth','manual_attribution',true),
    ('growth','ga4_oauth',true),
    ('growth','gsc_oauth',true),
    ('growth','social_x',true),
    ('growth','social_instagram',true),
    ('growth','social_youtube',true),
    ('growth','scheduled_reports',true),
    ('growth','alerts',true),
    ('growth','api_access',false),
    ('growth','white_label_reports',false),
    ('growth','admin_assisted_execution',false),
    ('enterprise','agent_readiness_full',true),
    ('enterprise','schema_fix_pack',true),
    ('enterprise','product_readiness',true),
    ('enterprise','product_catalog_import',true),
    ('enterprise','product_sampling',true),
    ('enterprise','query_fanout',true),
    ('enterprise','axp_drafts',true),
    ('enterprise','axp_publish',true),
    ('enterprise','verification_workflow',true),
    ('enterprise','competitive_parity',true),
    ('enterprise','production_audit',true),
    ('enterprise','launch_blocker_pack',true),
    ('enterprise','agent_analytics',true),
    ('enterprise','manual_attribution',true),
    ('enterprise','ga4_oauth',true),
    ('enterprise','gsc_oauth',true),
    ('enterprise','social_x',true),
    ('enterprise','social_instagram',true),
    ('enterprise','social_youtube',true),
    ('enterprise','scheduled_reports',true),
    ('enterprise','alerts',true),
    ('enterprise','api_access',true),
    ('enterprise','white_label_reports',true),
    ('enterprise','admin_assisted_execution',true)
) AS seed(plan_id, feature_key, enabled)
WHERE EXISTS (SELECT 1 FROM plan_capabilities WHERE id = seed.plan_id)
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = now();
