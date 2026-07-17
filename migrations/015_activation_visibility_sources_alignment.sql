-- Align visibility_scores and sources with current runtime schema

-- visibility_scores: new schema columns expected by storage/workers
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS competitor_id VARCHAR;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS period_start TIMESTAMP;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS period_end TIMESTAMP;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS overall_score REAL DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS top_position INTEGER;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS prompts_covered INTEGER DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS total_prompts INTEGER DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS coverage_rate REAL DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS sentiment_score REAL DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS citation_count INTEGER DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS model_breakdown JSONB;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS category_breakdown JSONB;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS citation_score REAL DEFAULT 0;
ALTER TABLE visibility_scores ADD COLUMN IF NOT EXISTS confidence_band REAL DEFAULT 17;

-- Backfill timestamps for existing rows
UPDATE visibility_scores
SET period_start = COALESCE(period_start, created_at),
    period_end = COALESCE(period_end, created_at)
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE visibility_scores ALTER COLUMN period_start SET DEFAULT NOW();
ALTER TABLE visibility_scores ALTER COLUMN period_end SET DEFAULT NOW();
ALTER TABLE visibility_scores ALTER COLUMN period_start SET NOT NULL;
ALTER TABLE visibility_scores ALTER COLUMN period_end SET NOT NULL;

-- Legacy column compatibility
ALTER TABLE visibility_scores ALTER COLUMN score SET DEFAULT 0;
ALTER TABLE visibility_scores ALTER COLUMN score DROP NOT NULL;

-- Add FK/indexes if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visibility_scores_competitor_id_fkey'
  ) THEN
    ALTER TABLE visibility_scores
      ADD CONSTRAINT visibility_scores_competitor_id_fkey
      FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS visibility_scores_brand_id_idx ON visibility_scores(brand_id);
CREATE INDEX IF NOT EXISTS visibility_scores_period_start_idx ON visibility_scores(period_start);

-- sources: add modern citation/source intelligence fields
ALTER TABLE sources ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS mentions INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS domain_authority INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS traffic_value INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS models_cited TEXT[];
ALTER TABLE sources ADD COLUMN IF NOT EXISTS citation_type TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS first_seen TIMESTAMP DEFAULT NOW();
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW();

-- Loosen legacy required columns not used by new runtime writes
ALTER TABLE sources ALTER COLUMN type DROP NOT NULL;
ALTER TABLE sources ALTER COLUMN name DROP NOT NULL;

-- Backfill values where possible
UPDATE sources
SET domain = COALESCE(domain, ''),
    title = COALESCE(title, name),
    source_type = COALESCE(source_type, type),
    first_seen = COALESCE(first_seen, created_at),
    last_seen = COALESCE(last_seen, updated_at)
WHERE domain IS NULL
   OR title IS NULL
   OR source_type IS NULL
   OR first_seen IS NULL
   OR last_seen IS NULL;

ALTER TABLE sources ALTER COLUMN domain SET DEFAULT '';
UPDATE sources SET domain = '' WHERE domain IS NULL;
ALTER TABLE sources ALTER COLUMN domain SET NOT NULL;

CREATE INDEX IF NOT EXISTS sources_brand_id_idx ON sources(brand_id);
