-- Migration 007: Visibility Platform Overhaul
-- Adds onboarding activation columns, competitor flag on mentions,
-- normalizedUrl for citation dedup, composite index, currency INR defaults.

-- === Brands: activation tracking ===
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (activation_status IN ('pending', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS last_provider_index INTEGER NOT NULL DEFAULT 0;

-- === Answer mentions: competitor flag ===
ALTER TABLE answer_mentions
  ADD COLUMN IF NOT EXISTS is_competitor BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS mentions_brand_competitor_idx
  ON answer_mentions (brand_id, is_competitor)
  WHERE is_competitor = true;

-- === Answer citations: normalised URL for deduplication ===
ALTER TABLE answer_citations
  ADD COLUMN IF NOT EXISTS normalized_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS citations_answer_url_unique
  ON answer_citations (llm_answer_id, normalized_url)
  WHERE normalized_url IS NOT NULL;

-- === Visibility scores: add citationScore and confidenceBand ===
ALTER TABLE visibility_scores
  ADD COLUMN IF NOT EXISTS citation_score REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_band REAL DEFAULT 17;

-- === Currency: default to INR ===
ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'INR';
-- subscriptions table has no currency column yet — add it first
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR NOT NULL DEFAULT 'INR';
ALTER TABLE invoices ALTER COLUMN currency SET DEFAULT 'INR';
