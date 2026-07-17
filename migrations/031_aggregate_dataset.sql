-- Migration 031: Prompt-volume scoring + opt-in aggregate dataset (Epic C2 + O)

ALTER TABLE brands ADD COLUMN IF NOT EXISTS contributes_to_aggregate boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS aggregate_dataset_entries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  region varchar NOT NULL DEFAULT 'IN',
  industry varchar NOT NULL,
  intent_type varchar NOT NULL,
  prompt_count integer NOT NULL DEFAULT 0,
  avg_demand_signal real NOT NULL DEFAULT 0,
  avg_priority_score real NOT NULL DEFAULT 0,
  contributor_count integer NOT NULL DEFAULT 0,
  period_start timestamp,
  period_end timestamp,
  rebuilt_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aggregate_dataset_dim_idx ON aggregate_dataset_entries (region, industry, intent_type);
