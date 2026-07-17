-- Migration: 019_feature_parity_foundation.sql
-- Epic M (Feature-Parity design doc §15/§16): reconcile schema drift + foundation.
-- 1. Adds the missing tables that server/storage.ts and billing webhooks already
--    reference (gap_analysis_results, recommendations, usage_logs) so the baseline
--    type-checks and seeds reliably.
-- 2. Adds the new plan_capabilities feature flags (§16.2).
-- Idempotent: safe to run on an existing database.

-- ===== plan_capabilities feature-parity flags (design doc §16.2) =====
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS browser_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS browser_capture_prompts_per_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS crawler_analytics_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS crawler_retention_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS execution_agents_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS agent_runs_per_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS max_locales INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS scheduled_reports_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS alert_channels_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Sensible per-plan defaults for the new flags (no-op if plans are absent).
UPDATE plan_capabilities SET scheduled_reports_enabled = TRUE, alert_channels_enabled = TRUE, crawler_analytics_enabled = TRUE, crawler_retention_days = 30
  WHERE id = 'starter';
UPDATE plan_capabilities SET scheduled_reports_enabled = TRUE, alert_channels_enabled = TRUE, crawler_analytics_enabled = TRUE, crawler_retention_days = 180,
  browser_capture_enabled = TRUE, browser_capture_prompts_per_day = 25, execution_agents_enabled = TRUE, agent_runs_per_month = 20, max_locales = 5
  WHERE id = 'growth';
UPDATE plan_capabilities SET scheduled_reports_enabled = TRUE, alert_channels_enabled = TRUE, crawler_analytics_enabled = TRUE, crawler_retention_days = 3650,
  browser_capture_enabled = TRUE, browser_capture_prompts_per_day = 100, execution_agents_enabled = TRUE, agent_runs_per_month = 100, max_locales = 50
  WHERE id IN ('enterprise', 'scale');

-- ===== gap_analysis_results (drift fix) =====
CREATE TABLE IF NOT EXISTS gap_analysis_results (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  topic_id VARCHAR REFERENCES topics(id) ON DELETE SET NULL,
  gap_type TEXT NOT NULL DEFAULT 'visibility',
  severity TEXT DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  affected_prompts TEXT[],
  opportunity_score REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gap_analysis_results_brand_idx ON gap_analysis_results(brand_id);

-- ===== recommendations (drift fix) =====
CREATE TABLE IF NOT EXISTS recommendations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  current_value REAL,
  potential_value REAL,
  effort_score INTEGER,
  impact_score INTEGER,
  impact TEXT,
  effort TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recommendations_brand_idx ON recommendations(brand_id);
CREATE INDEX IF NOT EXISTS recommendations_status_idx ON recommendations(status);

-- ===== usage_logs (drift fix: billing webhook) =====
CREATE TABLE IF NOT EXISTS usage_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR REFERENCES brands(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount REAL,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usage_logs_brand_idx ON usage_logs(brand_id);
CREATE INDEX IF NOT EXISTS usage_logs_type_idx ON usage_logs(type);

-- ===== Column reconciliation (code referenced columns that were never added) =====
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS previous_score REAL;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS total_mentions INTEGER DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS topic_scores JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR;
ALTER TABLE domain_registry ADD COLUMN IF NOT EXISTS brand_id VARCHAR;
ALTER TABLE domain_registry ADD COLUMN IF NOT EXISTS last_enriched TIMESTAMP;
