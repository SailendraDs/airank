-- Runtime tables required for activation pipeline workers

CREATE TABLE IF NOT EXISTS prompt_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  prompt_id VARCHAR NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  job_id VARCHAR REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  llm_provider TEXT NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  tokens_used INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prompt_runs_prompt_id_idx ON prompt_runs(prompt_id);
CREATE INDEX IF NOT EXISTS prompt_runs_brand_id_idx ON prompt_runs(brand_id);
CREATE INDEX IF NOT EXISTS prompt_runs_status_idx ON prompt_runs(status);

CREATE TABLE IF NOT EXISTS answer_mentions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  llm_answer_id VARCHAR NOT NULL REFERENCES llm_answers(id) ON DELETE CASCADE,
  brand_id VARCHAR REFERENCES brands(id) ON DELETE CASCADE,
  competitor_id VARCHAR REFERENCES competitors(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  position INTEGER,
  context TEXT,
  sentiment TEXT,
  confidence REAL DEFAULT 0,
  is_competitor BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS answer_mentions_llm_answer_id_idx ON answer_mentions(llm_answer_id);
CREATE INDEX IF NOT EXISTS answer_mentions_brand_id_idx ON answer_mentions(brand_id);
CREATE INDEX IF NOT EXISTS answer_mentions_competitor_id_idx ON answer_mentions(competitor_id);
CREATE INDEX IF NOT EXISTS mentions_brand_competitor_idx ON answer_mentions(brand_id, is_competitor) WHERE is_competitor = TRUE;

CREATE TABLE IF NOT EXISTS answer_citations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  llm_answer_id VARCHAR NOT NULL REFERENCES llm_answers(id) ON DELETE CASCADE,
  source_id VARCHAR REFERENCES sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  position INTEGER,
  citation_type TEXT,
  normalized_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS answer_citations_llm_answer_id_idx ON answer_citations(llm_answer_id);
CREATE INDEX IF NOT EXISTS answer_citations_source_id_idx ON answer_citations(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS citations_answer_url_unique
  ON answer_citations(llm_answer_id, normalized_url)
  WHERE normalized_url IS NOT NULL;

-- Keep compatibility if older partial table exists
ALTER TABLE answer_mentions ADD COLUMN IF NOT EXISTS is_competitor BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE answer_citations ADD COLUMN IF NOT EXISTS normalized_url TEXT;
