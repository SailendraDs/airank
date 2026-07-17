-- Production compatibility for activation analytics tables.
-- Keeps existing answers, mentions, scores, brands, accounts, and subscriptions intact.

ALTER TABLE llm_answers
  ADD COLUMN IF NOT EXISTS competitor_id VARCHAR REFERENCES competitors(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS llm_answers_competitor_id_idx
  ON llm_answers(competitor_id);

CREATE INDEX IF NOT EXISTS llm_answers_brand_created_idx
  ON llm_answers(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_answers_brand_provider_created_idx
  ON llm_answers(brand_id, llm_provider, created_at DESC);

CREATE INDEX IF NOT EXISTS answer_mentions_brand_created_idx
  ON answer_mentions(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS answer_mentions_brand_competitor_created_idx
  ON answer_mentions(brand_id, is_competitor, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_runs_brand_created_idx
  ON prompt_runs(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_runs_brand_provider_status_created_idx
  ON prompt_runs(brand_id, llm_provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_runs_brand_provider_completed_idx
  ON prompt_runs(brand_id, llm_provider, completed_at DESC);

ALTER TABLE visibility_scores
  ADD COLUMN IF NOT EXISTS mentioned_prompts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wikidata_bonus INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_bonus INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS visibility_scores_brand_period_start_idx
  ON visibility_scores(brand_id, period_start DESC);

CREATE INDEX IF NOT EXISTS visibility_scores_brand_period_period_start_idx
  ON visibility_scores(brand_id, period, period_start DESC);
