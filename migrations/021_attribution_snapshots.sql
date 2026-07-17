-- Migration 021: Attribution snapshots (Epic E)
-- Persists real GA4/GSC AI-referral attribution over time (replaces simulated numbers).

CREATE TABLE IF NOT EXISTS attribution_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  period_start timestamp NOT NULL,
  period_end timestamp NOT NULL,
  source varchar NOT NULL DEFAULT 'ga4',
  ai_referral_sessions integer NOT NULL DEFAULT 0,
  ai_referral_conversions integer NOT NULL DEFAULT 0,
  ai_attributed_revenue real NOT NULL DEFAULT 0,
  branded_impressions integer NOT NULL DEFAULT 0,
  branded_clicks integer NOT NULL DEFAULT 0,
  by_engine jsonb,
  top_landing_pages jsonb,
  data_complete boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attribution_snapshots_brand_idx ON attribution_snapshots (brand_id);
