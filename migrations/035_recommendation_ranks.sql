-- Migration 035: Create recommendation_ranks table (Tier S5 — AI Recommendation Share)
-- Records each LLM's ranking of the brand per prompt. The "AI Recommendation Share"
-- is the % of responses where the brand appears in the top 3.

CREATE TABLE IF NOT EXISTS recommendation_ranks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_id varchar REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_text text NOT NULL,
  llm_provider varchar NOT NULL,
  llm_model text,
  rank integer,
  is_recommended boolean NOT NULL DEFAULT false,
  total_brands_in_response integer DEFAULT 0,
  raw_response text,
  top_brands jsonb DEFAULT '[]'::jsonb,
  intent varchar,
  run_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendation_ranks_brand_idx ON recommendation_ranks(brand_id);
CREATE INDEX IF NOT EXISTS recommendation_ranks_brand_run_idx ON recommendation_ranks(brand_id, run_at);
CREATE INDEX IF NOT EXISTS recommendation_ranks_provider_idx ON recommendation_ranks(brand_id, llm_provider);

COMMENT ON TABLE recommendation_ranks IS 'Per-prompt LLM ranking of the brand — the basis for AI Recommendation Share.';
COMMENT ON COLUMN recommendation_ranks.rank IS 'Position the brand was assigned in the LLM response list. 1 = top. NULL = not mentioned.';
COMMENT ON COLUMN recommendation_ranks.is_recommended IS 'True if rank <= 3. Drives AI Recommendation Share %.';
