-- Migration 023: Real AI-crawler analytics (Epic B)
-- crawler_logs table + per-brand rotatable ingest token.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS crawler_ingest_token varchar;
CREATE UNIQUE INDEX IF NOT EXISTS brands_crawler_token_idx ON brands (crawler_ingest_token) WHERE crawler_ingest_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS crawler_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  bot_name varchar NOT NULL,
  bot_category varchar NOT NULL DEFAULT 'other',
  engine varchar,
  verified boolean NOT NULL DEFAULT false,
  ip_address varchar,
  user_agent text,
  path text,
  status_code integer,
  method varchar,
  referrer text,
  visited_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawler_logs_brand_idx ON crawler_logs (brand_id);
CREATE INDEX IF NOT EXISTS crawler_logs_visited_idx ON crawler_logs (visited_at);
CREATE INDEX IF NOT EXISTS crawler_logs_bot_idx ON crawler_logs (bot_name);
