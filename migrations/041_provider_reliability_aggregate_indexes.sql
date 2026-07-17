CREATE INDEX IF NOT EXISTS llm_answers_brand_provider_created_idx ON llm_answers(brand_id, llm_provider, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_runs_brand_provider_status_created_idx ON prompt_runs(brand_id, llm_provider, status, created_at DESC);
CREATE INDEX IF NOT EXISTS prompt_runs_brand_provider_completed_idx ON prompt_runs(brand_id, llm_provider, completed_at DESC);
