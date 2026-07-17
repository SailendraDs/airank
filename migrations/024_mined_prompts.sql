-- Migration 024: Prompt intelligence — mined prompts (Epic C1)

CREATE TABLE IF NOT EXISTS mined_prompts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  query text NOT NULL,
  normalized_query text NOT NULL,
  source varchar NOT NULL,
  intent_type varchar NOT NULL DEFAULT 'discovery',
  source_url text,
  upvotes integer,
  comment_count integer,
  view_count integer,
  search_volume integer,
  demand_signal real NOT NULL DEFAULT 0,
  priority_score real NOT NULL DEFAULT 0,
  status varchar NOT NULL DEFAULT 'new',
  promoted_prompt_id varchar,
  locale varchar,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mined_prompts_brand_idx ON mined_prompts (brand_id);
CREATE INDEX IF NOT EXISTS mined_prompts_priority_idx ON mined_prompts (priority_score);
CREATE UNIQUE INDEX IF NOT EXISTS mined_prompts_dedupe_idx ON mined_prompts (brand_id, normalized_query);
