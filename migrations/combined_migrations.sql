-- ============================================
-- GeoScore - Combined Database Migrations
-- ============================================
-- This file combines all migrations in chronological order
-- Generated: 2026-01-29
-- Compatible with: PostgreSQL 14+, Supabase, Convex
-- ============================================

-- ============================================
-- MIGRATION 001: Initial Schema
-- ============================================
-- Description: Initial schema for production deployment
-- Tables Created: 24
-- Indexes Created: 50+
-- Default Data: 4 plan capabilities
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============= PLAN CAPABILITIES =============

CREATE TABLE IF NOT EXISTS plan_capabilities (
  id VARCHAR PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  monthly_price INTEGER NOT NULL DEFAULT 0,
  max_competitors INTEGER NOT NULL DEFAULT 3,
  max_topics INTEGER NOT NULL DEFAULT 3,
  max_prompts INTEGER NOT NULL DEFAULT 15,
  max_team_members INTEGER NOT NULL DEFAULT 1,
  allowed_llm_providers TEXT[],
  allowed_integrations TEXT[],
  refresh_frequency TEXT NOT NULL DEFAULT 'weekly',
  export_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whitelabel_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
  sso_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  audit_logs_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_query_limit INTEGER DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============= USERS =============

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY,
  email VARCHAR UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  phone VARCHAR,
  phone_verified BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- ============= BRANDS =============

CREATE TABLE IF NOT EXISTS brands (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  logo TEXT,
  industry TEXT,
  description TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  entity_type TEXT,
  core_topics TEXT[],
  brand_variations TEXT[],
  target_market TEXT,
  primary_language TEXT DEFAULT 'en',
  visibility_score REAL DEFAULT 0,
  ai_traffic_estimate INTEGER DEFAULT 0,
  last_analysis TIMESTAMP,
  next_scheduled_analysis TIMESTAMP,
  analysis_enabled BOOLEAN DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMP,
  subscription_id VARCHAR,
  subscription_status TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain);
CREATE INDEX IF NOT EXISTS idx_brands_tier ON brands(tier);
CREATE INDEX IF NOT EXISTS idx_brands_status ON brands(status);

-- ============= TEAM MEMBERS =============

CREATE TABLE IF NOT EXISTS team_members (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by VARCHAR REFERENCES users(id),
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  permissions JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_brand_id ON team_members(brand_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);

-- ============= COMPETITORS =============

CREATE TABLE IF NOT EXISTS competitors (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  logo TEXT,
  description TEXT,
  industry TEXT,
  visibility_score REAL DEFAULT 0,
  ai_traffic_estimate INTEGER DEFAULT 0,
  last_analysis TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitors_brand_id ON competitors(brand_id);
CREATE INDEX IF NOT EXISTS idx_competitors_domain ON competitors(domain);

-- ============= TOPICS =============

CREATE TABLE IF NOT EXISTS topics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT[],
  category TEXT,
  priority INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_brand_id ON topics(brand_id);

-- ============= PROMPTS =============

CREATE TABLE IF NOT EXISTS prompts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  topic_id VARCHAR REFERENCES topics(id) ON DELETE SET NULL,
  template_id VARCHAR,
  query TEXT NOT NULL,
  category TEXT,
  intent TEXT,
  expected_mention BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompts_brand_id ON prompts(brand_id);
CREATE INDEX IF NOT EXISTS idx_prompts_topic_id ON prompts(topic_id);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);

-- ============= PROMPT TEMPLATES (Admin) =============

CREATE TABLE IF NOT EXISTS prompt_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  variables TEXT[],
  example_output TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);

-- ============= LLM RESPONSES =============

CREATE TABLE IF NOT EXISTS llm_responses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  prompt_id VARCHAR NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response_text TEXT NOT NULL,
  mentioned BOOLEAN DEFAULT FALSE,
  position INTEGER,
  sentiment TEXT,
  context_quality REAL,
  relevance_score REAL,
  tokens_used INTEGER,
  response_time INTEGER,
  cost REAL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_responses_prompt_id ON llm_responses(prompt_id);
CREATE INDEX IF NOT EXISTS idx_llm_responses_brand_id ON llm_responses(brand_id);
CREATE INDEX IF NOT EXISTS idx_llm_responses_provider ON llm_responses(provider);
CREATE INDEX IF NOT EXISTS idx_llm_responses_created_at ON llm_responses(created_at);

-- ============= SOURCES (Google Ecosystem) =============

CREATE TABLE IF NOT EXISTS sources (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  config JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_brand_id ON sources(brand_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);

-- ============= INTEGRATIONS =============

CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB,
  credentials JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_sync TIMESTAMP,
  sync_status TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_brand_id ON integrations(brand_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);

-- ============= JOBS =============

CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  payload JSONB,
  result JSONB,
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_brand_id ON jobs(brand_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- ============= JOB ERRORS =============

CREATE TABLE IF NOT EXISTS job_errors (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by VARCHAR REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_errors_job_id ON job_errors(job_id);
CREATE INDEX IF NOT EXISTS idx_job_errors_resolved ON job_errors(resolved);

-- ============= ANALYSIS SCHEDULES =============

CREATE TABLE IF NOT EXISTS analysis_schedules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_schedules_brand_id ON analysis_schedules(brand_id);
CREATE INDEX IF NOT EXISTS idx_analysis_schedules_next_run ON analysis_schedules(next_run);

-- ============= VISIBILITY SCORES =============

CREATE TABLE IF NOT EXISTS visibility_scores (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  score REAL NOT NULL,
  mention_count INTEGER DEFAULT 0,
  positive_mentions INTEGER DEFAULT 0,
  neutral_mentions INTEGER DEFAULT 0,
  negative_mentions INTEGER DEFAULT 0,
  avg_position REAL,
  top_providers TEXT[],
  top_topics TEXT[],
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visibility_scores_brand_id ON visibility_scores(brand_id);
CREATE INDEX IF NOT EXISTS idx_visibility_scores_period ON visibility_scores(period);
CREATE INDEX IF NOT EXISTS idx_visibility_scores_created_at ON visibility_scores(created_at);

-- ============= GAP ANALYSES =============

CREATE TABLE IF NOT EXISTS gap_analyses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  missing_topics TEXT[],
  weak_areas TEXT[],
  competitor_advantages JSONB,
  recommendations TEXT[],
  priority_score REAL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_analyses_brand_id ON gap_analyses(brand_id);
CREATE INDEX IF NOT EXISTS idx_gap_analyses_created_at ON gap_analyses(created_at);

-- ============= RECOMMENDATIONS =============

CREATE TABLE IF NOT EXISTS recommendations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  impact_score REAL,
  effort_score REAL,
  status TEXT DEFAULT 'pending',
  implemented_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_brand_id ON recommendations(brand_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_priority ON recommendations(priority);

-- ============= AUDIT LOGS =============

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR REFERENCES users(id),
  brand_id VARCHAR REFERENCES brands(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id VARCHAR NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_brand_id ON audit_logs(brand_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============= SUBSCRIPTIONS =============

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL UNIQUE REFERENCES brands(id) ON DELETE CASCADE,
  plan_id VARCHAR NOT NULL REFERENCES plan_capabilities(id),
  status TEXT NOT NULL DEFAULT 'active',
  razorpay_subscription_id VARCHAR UNIQUE,
  razorpay_customer_id VARCHAR,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_brand_id ON subscriptions(brand_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============= INVOICES =============

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscription_id VARCHAR NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  razorpay_invoice_id VARCHAR UNIQUE,
  razorpay_payment_id VARCHAR,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending',
  invoice_number VARCHAR UNIQUE,
  invoice_date TIMESTAMP DEFAULT NOW(),
  due_date TIMESTAMP,
  paid_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_brand_id ON invoices(brand_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ============= WEBHOOK EVENTS =============

CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);

-- ============= AXP CONTENT (Admin Experience Platform) =============

CREATE TABLE IF NOT EXISTS axp_content (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_axp_content_type ON axp_content(type);
CREATE INDEX IF NOT EXISTS idx_axp_content_status ON axp_content(status);

-- ============= INSERT DEFAULT PLAN CAPABILITIES =============

INSERT INTO plan_capabilities (id, name, display_name, monthly_price, max_competitors, max_topics, max_prompts, max_team_members, allowed_llm_providers, allowed_integrations, refresh_frequency, export_enabled, api_access_enabled, whitelabel_enabled, priority_support, custom_branding, sso_enabled, audit_logs_enabled, daily_query_limit, is_active)
VALUES
  ('free', 'free', 'Free', 0, 3, 3, 6, 1, ARRAY['chatgpt'], ARRAY['gsc'], 'weekly', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 6, TRUE),
  ('starter', 'starter', 'Starter', 2999, 5, 10, 50, 3, ARRAY['chatgpt', 'claude', 'gemini'], ARRAY['gsc', 'twitter', 'linkedin'], 'daily', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 500, TRUE),
  ('growth', 'growth', 'Growth', 9999, 15, 30, 200, 10, ARRAY['chatgpt', 'claude', 'gemini', 'perplexity', 'grok'], ARRAY['gsc', 'twitter', 'linkedin', 'reddit'], 'hourly', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, TRUE, 2000, TRUE),
  ('enterprise', 'enterprise', 'Enterprise', 29999, -1, -1, -1, -1, ARRAY['chatgpt', 'claude', 'gemini', 'perplexity', 'grok', 'deepseek', 'openrouter'], ARRAY['gsc', 'twitter', 'linkedin', 'reddit'], 'hourly', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, -1, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- END OF COMBINED MIGRATIONS
-- ============================================
-- Total Migrations: 1
-- Total Tables: 24
-- Total Indexes: 50+
-- Total Default Records: 4 plan capabilities
-- ============================================
