-- Runtime schema alignment for onboarding-compatible columns

-- Competitors table: align with shared/schema.ts
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_tracked BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS trend_7d REAL DEFAULT 0;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS avg_rank REAL DEFAULT 0;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS mentions INTEGER DEFAULT 0;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS traffic_est INTEGER DEFAULT 0;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS threat_score REAL DEFAULT 0;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS prompt_overlap_pct REAL DEFAULT 0;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS top_dominated_domains TEXT[];
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS risk_reason TEXT;

-- Topics table: align with shared/schema.ts
ALTER TABLE topics ADD COLUMN IF NOT EXISTS importance TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS prompt_count INTEGER DEFAULT 0;

-- Prompts table: align with shared/schema.ts
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS models_covered TEXT[];
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS avg_rank REAL DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS visibility_pct REAL DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS top_competitor_id VARCHAR;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_brand_present BOOLEAN DEFAULT FALSE;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS last_checked TIMESTAMP;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Backfill prompt text from legacy query column where possible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompts' AND column_name = 'query'
  ) THEN
    UPDATE prompts
    SET text = query
    WHERE text IS NULL AND query IS NOT NULL;
  END IF;
END $$;

-- analysis_schedules table: scheduler expects is_enabled
ALTER TABLE analysis_schedules ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;
