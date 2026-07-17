-- Migration 032: Public API keys + webhook subscriptions (Epic L)

CREATE TABLE IF NOT EXISTS api_keys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix varchar NOT NULL,
  key_hash text NOT NULL,
  scopes text[],
  last_used_at timestamp,
  status varchar NOT NULL DEFAULT 'active',
  created_at timestamp DEFAULT now(),
  revoked_at timestamp
);

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys (prefix);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id varchar REFERENCES brands(id) ON DELETE CASCADE,
  event varchar NOT NULL,
  target_url text NOT NULL,
  source varchar NOT NULL DEFAULT 'zapier',
  secret varchar,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_subs_user_idx ON webhook_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS webhook_subs_event_idx ON webhook_subscriptions (event);
