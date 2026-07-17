-- Migration: 018_job_history.sql
-- Job Monitor & AI Auto-Fix System Tables

-- Job History Table
CREATE TABLE IF NOT EXISTS job_history (
  id VARCHAR PRIMARY KEY,
  type VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  brand_id VARCHAR,
  payload JSONB NOT NULL,
  result JSONB,
  error_message TEXT,
  error_trace TEXT,
  attempts INTEGER DEFAULT 0,
  fixed_by VARCHAR,
  fixed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_history_status ON job_history(status);
CREATE INDEX IF NOT EXISTS idx_job_history_type ON job_history(type);
CREATE INDEX IF NOT EXISTS idx_job_history_brand_id ON job_history(brand_id);
CREATE INDEX IF NOT EXISTS idx_job_history_created_at ON job_history(created_at DESC);

-- Job Fix Rules Table
CREATE TABLE IF NOT EXISTS job_fix_rules (
  job_type VARCHAR PRIMARY KEY,
  auto_fix BOOLEAN DEFAULT FALSE,
  fix_method VARCHAR DEFAULT 'api' CHECK (fix_method IN ('cli', 'api')),
  notify_email BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Fix Configuration Table
CREATE TABLE IF NOT EXISTS ai_fix_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT FALSE,
  fix_method VARCHAR DEFAULT 'api' CHECK (fix_method IN ('cli', 'api')),
  cli_path VARCHAR DEFAULT '/usr/local/bin/claude',
  api_url VARCHAR DEFAULT 'https://api.anthropic.com',
  api_key VARCHAR,
  model VARCHAR DEFAULT 'claude-opus-4.6',
  timeout_minutes INTEGER DEFAULT 5,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default fix rules for all job types
INSERT INTO job_fix_rules (job_type, auto_fix, fix_method, notify_email, priority) VALUES
  ('brand_enrichment', false, 'api', true, 5),
  ('competitor_enrichment', false, 'api', true, 5),
  ('topic_generation', false, 'api', true, 5),
  ('query_generation', false, 'api', true, 5),
  ('llm_sampling', false, 'api', true, 5),
  ('serp_sampling', false, 'api', true, 5),
  ('citation_extraction', false, 'api', true, 5),
  ('visibility_scoring', false, 'api', true, 5),
  ('gap_analysis', false, 'api', true, 5),
  ('recommendation_generation', false, 'api', true, 5),
  ('axp_publish', false, 'api', true, 5),
  ('serp_analysis', false, 'api', true, 5),
  ('knowledge_graph_analysis', false, 'api', true, 5),
  ('social_analytics', false, 'api', true, 5),
  ('content_recommendations', false, 'api', true, 5),
  ('kg_enrichment', false, 'api', true, 5),
  ('prompt_mining', false, 'api', true, 5)
ON CONFLICT (job_type) DO NOTHING;

-- Insert default AI fix config
INSERT INTO ai_fix_config (id, enabled, fix_method, api_url, model, timeout_minutes)
VALUES (1, false, 'api', 'https://api.anthropic.com', 'claude-opus-4.6', 5)
ON CONFLICT (id) DO NOTHING;