-- Runtime schema repair for production DB drift

-- 1) subscriptions: align with shared/schema.ts
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR NOT NULL DEFAULT 'INR';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS metadata JSONB;

-- historical rows + plan changes may require more than one row per brand
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_brand_id_key;

CREATE INDEX IF NOT EXISTS subscriptions_brand_id_idx ON subscriptions(brand_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

-- 2) invoices: align with shared/schema.ts
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;

CREATE INDEX IF NOT EXISTS invoices_brand_id_idx ON invoices(brand_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

-- 3) payments table (missing)
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  invoice_id VARCHAR REFERENCES invoices(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency VARCHAR NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  stripe_payment_intent_id VARCHAR,
  razorpay_payment_id VARCHAR,
  razorpay_order_id VARCHAR,
  failure_reason TEXT,
  refunded_at TIMESTAMP,
  refund_id VARCHAR,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_brand_id_idx ON payments(brand_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);

-- 4) llm_answers table (missing)
CREATE TABLE IF NOT EXISTS llm_answers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  prompt_id VARCHAR NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  parsed_response JSONB,
  response_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_answers_prompt_id_idx ON llm_answers(prompt_id);
CREATE INDEX IF NOT EXISTS llm_answers_brand_id_idx ON llm_answers(brand_id);
CREATE INDEX IF NOT EXISTS llm_answers_created_at_idx ON llm_answers(created_at);

-- 5) brand_context table (missing)
CREATE TABLE IF NOT EXISTS brand_context (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL UNIQUE REFERENCES brands(id) ON DELETE CASCADE,

  brand_identity JSONB,
  product_services JSONB,
  target_audience JSONB,

  industry_context JSONB,
  competitive_landscape JSONB,
  market_position JSONB,

  key_messages JSONB,
  content_themes JSONB,
  brand_voice JSONB,

  claims_graph JSONB,
  evidence_sources JSONB,
  fact_checking JSONB,

  llm_performance JSONB,
  prompt_coverage JSONB,
  citation_analysis JSONB,
  sentiment_analysis JSONB,

  gap_analysis JSONB,
  recommended_actions JSONB,
  content_recommendations JSONB,

  gsc_data JSONB,
  social_data JSONB,
  analytics_data JSONB,

  embeddings_vector TEXT,
  search_keywords TEXT[],
  semantic_topics TEXT[],

  last_enriched TIMESTAMP,
  enrichment_version INTEGER DEFAULT 1,
  data_quality_score REAL DEFAULT 0,
  completeness_score REAL DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_context_brand_id_idx ON brand_context(brand_id);

-- 6) api_logs table (missing)
CREATE TABLE IF NOT EXISTS api_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time INTEGER NOT NULL,
  user_id VARCHAR,
  brand_id VARCHAR,
  error_message TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_logs_level_idx ON api_logs(level);
CREATE INDEX IF NOT EXISTS api_logs_created_at_idx ON api_logs(created_at);
CREATE INDEX IF NOT EXISTS api_logs_status_code_idx ON api_logs(status_code);
