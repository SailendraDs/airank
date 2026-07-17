-- Migration 036: Full Entity Stack (Tiers B + C + D from report.md)
-- Adds 11 new tables + 4 column extensions + intent-weighted scoring
-- Includes: entityLinks, entityProfile, people, entitySocialPresence, entityCooccurrences,
-- entityDisambiguationTests, schemaInventory, groundTruth, retrievalTests,
-- topicEntityAssociations, communityValidation

BEGIN;

-- ============= PART B: COLUMN EXTENSIONS =============

-- Add brand identity columns (brands table)
ALTER TABLE brands
ADD COLUMN IF NOT EXISTS founder_name TEXT,
ADD COLUMN IF NOT EXISTS founders TEXT[],  -- JSON array stored as text
ADD COLUMN IF NOT EXISTS year_founded INTEGER,
ADD COLUMN IF NOT EXISTS legal_name TEXT,
ADD COLUMN IF NOT EXISTS dba_names TEXT[],
ADD COLUMN IF NOT EXISTS parent_company_id TEXT REFERENCES brands(id),
ADD COLUMN IF NOT EXISTS stock_symbol TEXT,
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- Add trust weights (sources table)
ALTER TABLE sources
ADD COLUMN IF NOT EXISTS trust_weight REAL DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS source_type_authority REAL DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS content_type TEXT,
ADD COLUMN IF NOT EXISTS language TEXT,
ADD COLUMN IF NOT EXISTS region TEXT;

-- Add entity delta (optimization_logs table)
ALTER TABLE optimization_logs
ADD COLUMN IF NOT EXISTS entity_delta REAL;

-- Ensure prompts has intent columns (should exist from 034, but ensure)
ALTER TABLE prompts
ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'discovery',
ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'llm_generation',
ADD COLUMN IF NOT EXISTS weight REAL DEFAULT 1.0;

-- Add recommendation ranks table
CREATE TABLE IF NOT EXISTS recommendation_ranks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  llm_provider TEXT NOT NULL,
  llm_model TEXT,
  rank INTEGER,
  top_brands JSONB DEFAULT '[]',
  run_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recommendation_ranks_brand_idx ON recommendation_ranks(brand_id);

-- ============= PART C: NEW ENTITY TABLES =============

-- entityLinks: external identifiers
CREATE TABLE IF NOT EXISTS entity_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,  -- wikidata|wikipedia|google_kg|crunchbase|linkedin|x|youtube|github|instagram|tiktok|medium|substack|producthunt|g2|capterra|trustpilot|opencorporates|sec|playstore|appstore|stackoverflow|reddit
  external_id TEXT,
  url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  last_checked TIMESTAMP,
  source TEXT DEFAULT 'manual',  -- manual|auto|imported
  confidence REAL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS entity_links_brand_platform_idx ON entity_links(brand_id, platform);

-- entityProfile: canonical brand profile
CREATE TABLE IF NOT EXISTS entity_profile (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT UNIQUE NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  wikidata_id TEXT,
  wikipedia_slug TEXT,
  google_kg_id TEXT,
  crunchbase_handle TEXT,
  legal_name TEXT,
  dba_names TEXT[],
  year_founded INTEGER,
  parent_company_id TEXT REFERENCES brands(id),
  subsidiaries TEXT[],
  stock_symbol TEXT,
  founders TEXT[],  -- JSON array of founder names
  key_people TEXT[], -- JSON array of key people names
  social_profiles JSONB DEFAULT '{}',
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS entity_profile_brand_idx ON entity_profile(brand_id);

-- people: founders, executives, authors
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  wikipedia_slug TEXT,
  wikidata_id TEXT,
  is_founder BOOLEAN DEFAULT FALSE,
  is_author BOOLEAN DEFAULT FALSE,
  bio TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS people_brand_idx ON people(brand_id);

-- entitySocialPresence: per-platform social presence
CREATE TABLE IF NOT EXISTS entity_social_presence (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,  -- linkedin|x|youtube|instagram|medium|github|reddit|producthunt|g2|capterra|trustpilot|stackoverflow|hackernews|substack
  handle TEXT,
  url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  followers INTEGER DEFAULT 0,
  following INTEGER DEFAULT 0,
  posts_last_30d INTEGER DEFAULT 0,
  avg_engagement_rate REAL DEFAULT 0.0,
  avg_post_reach INTEGER DEFAULT 0,
  sentiment REAL DEFAULT 0.0,
  authority_score REAL DEFAULT 0.0,
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS entity_social_presence_brand_platform_idx ON entity_social_presence(brand_id, platform);

-- entityCooccurrences: entity relationships
CREATE TABLE IF NOT EXISTS entity_cooccurrences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  co_entity_name TEXT NOT NULL,
  co_entity_type TEXT,  -- brand|person|topic|publication|product
  context TEXT,
  llm_answer_id TEXT,
  frequency INTEGER DEFAULT 1,
  avg_sentiment REAL DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS entity_cooccurrences_brand_idx ON entity_cooccurrences(brand_id);

-- entityDisambiguationTests: labeled disambiguation test set
CREATE TABLE IF NOT EXISTS entity_disambiguation_tests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  expected_entity TEXT,
  expected_answer TEXT,
  actual_answer TEXT,
  is_correct BOOLEAN,
  tested_at TIMESTAMP,
  llm_provider TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS entity_disambiguation_tests_brand_idx ON entity_disambiguation_tests(brand_id);

-- schemaInventory: JSON-LD coverage per page
CREATE TABLE IF NOT EXISTS schema_inventory (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  schema_type TEXT,  -- Organization|Product|FAQPage|Article|LocalBusiness|BreadcrumbList|Person
  valid BOOLEAN DEFAULT TRUE,
  errors JSONB DEFAULT '[]',
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS schema_inventory_brand_idx ON schema_inventory(brand_id);
CREATE INDEX IF NOT EXISTS schema_inventory_url_idx ON schema_inventory(page_url);

-- groundTruth: canonical brand facts
CREATE TABLE IF NOT EXISTS ground_truth (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  key TEXT NOT NULL,  -- category|founder|hq|founded|problem_solved|...
  value TEXT NOT NULL,
  source_url TEXT,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ground_truth_brand_idx ON ground_truth(brand_id);

-- retrievalTests: retrieval test results
CREATE TABLE IF NOT EXISTS retrieval_tests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  source_url TEXT,
  brand_mentioned_before BOOLEAN DEFAULT FALSE,
  brand_mentioned_after BOOLEAN DEFAULT FALSE,
  retrieved BOOLEAN,
  tested_at TIMESTAMP,
  llm_provider TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS retrieval_tests_brand_idx ON retrieval_tests(brand_id);

-- topicEntityAssociations: topic -> brand association strength
CREATE TABLE IF NOT EXISTS topic_entity_associations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
  topic_name TEXT,  -- denormalized for easier queries
  association_score REAL DEFAULT 0.0,
  sample_size INTEGER DEFAULT 0,
  last_computed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS topic_entity_associations_brand_topic_idx ON topic_entity_associations(brand_id, topic_id);

-- communityValidation: Reddit, HN, G2, etc. validation
CREATE TABLE IF NOT EXISTS community_validation (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,  -- reddit|hackernews|stackoverflow|producthunt|g2|capterra|trustpilot|youtube_comments
  mention_count INTEGER DEFAULT 0,
  recommendation_count INTEGER DEFAULT 0,
  total_discussions INTEGER DEFAULT 0,
  share_pct REAL DEFAULT 0.0,
  avg_sentiment REAL DEFAULT 0.0,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_validation_brand_platform_idx ON community_validation(brand_id, platform);

-- ============= BACKFILL FROM EXISTING DATA =============

-- Backfill entityProfile from brands table
INSERT INTO entity_profile (brand_id, legal_name, dba_names, year_founded, stock_symbol, last_updated)
SELECT id, legal_name, dba_names, year_founded, stock_symbol, NOW()
FROM brands WHERE legal_name IS NOT NULL OR dba_names IS NOT NULL OR year_founded IS NOT NULL OR stock_symbol IS NOT NULL
ON CONFLICT (brand_id) DO NOTHING;

-- Backfill entitySocialPresence from brands.social_links
INSERT INTO entity_social_presence (brand_id, platform, handle, url, last_checked)
SELECT b.id, social.key, social.value->>'handle', social.value->>'url', NOW()
FROM brands b
CROSS JOIN LATERAL jsonb_each(b.social_links) AS social(key, value)
WHERE b.social_links IS NOT NULL AND jsonb_typeof(b.social_links) = 'object'
ON CONFLICT DO NOTHING;

-- Backfill existing groundTruth from brands
INSERT INTO ground_truth (brand_id, key, value, verified_at)
SELECT id, 'category', industry, NOW() FROM brands WHERE industry IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO ground_truth (brand_id, key, value, verified_at)
SELECT id, 'description', description, NOW() FROM brands WHERE description IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============= TRUST WEIGHT DEFAULTS BY SOURCE TYPE =============

UPDATE sources SET trust_weight = 10.0 WHERE source_type = 'wiki';
UPDATE sources SET trust_weight = 10.0 WHERE domain ILIKE '%wikipedia%';
UPDATE sources SET trust_weight = 8.0 WHERE source_type = 'g2' OR source_type = 'capterra';
UPDATE sources SET trust_weight = 10.0 WHERE source_type = 'crunchbase';
UPDATE sources SET trust_weight = 15.0 WHERE source_type = 'news' AND (domain ILIKE '%nyt%' OR domain ILIKE '%techcrunch%' OR domain ILIKE '%forbes%');
UPDATE sources SET trust_weight = 10.0 WHERE source_type = 'reddit';
UPDATE sources SET trust_weight = 5.0 WHERE domain ILIKE '%reddit%';
UPDATE sources SET trust_weight = 2.0 WHERE trust_weight IS NULL OR trust_weight < 2.0;

-- ============= INTENT CLASSIFICATION BACKFILL FOR PROMPTS =============

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, text FROM prompts WHERE intent IS NULL OR intent = 'discovery'
  LOOP
    UPDATE prompts
    SET
      intent = CASE
        WHEN r.text ~* '\m(buy|sign up|subscribe|pricing|cost|price|cheap|free trial|best deal)\m' THEN 'buying'
        WHEN r.text ~* '\m(vs\.?|versus|alternative|competitor|compared to|or)\m' AND r.text ~* '\m(best|top|recommend)\m' THEN 'comparison'
        WHEN r.text ~* '\m(migrate|switch|replace|instead of|abandon|leaving)\m' THEN 'migrate'
        WHEN r.text ~* '\m(review|opinion|experience|worth it|thoughts|feedback)\m' THEN 'review'
        WHEN r.text ~* '\m(price|cost|cheap|expensive|affordable|subscription|how much)\m' THEN 'pricing'
        WHEN r.text ~* '\m(how to|tutorial|guide|setup|step.?by.?step|learn|course)\m' THEN 'howto'
        WHEN r.text ~* '\m(problem|issue|broken|error|fix|crash|bug|not working|help)\m' THEN 'problem'
        WHEN r.text ~* '\m(near me|in \w+|local|nearby|city|region|country)\m' THEN 'local'
        WHEN r.text ~* '\m(bad|worst|terrible|avoid|hate|sucks|complaint)\m' THEN 'negative'
        ELSE 'discovery'
      END,
      weight = CASE
        WHEN r.text ~* '\m(buy|sign up|subscribe)\m' THEN 1.5
        WHEN r.text ~* '\m(vs\.?|versus|alternative|competitor)\m' THEN 1.5
        WHEN r.text ~* '\m(migrate|switch|replace)\m' THEN 1.5
        WHEN r.text ~* '\m(price|cost|pricing)\m' THEN 0.9
        WHEN r.text ~* '\m(review|opinion)\m' THEN 0.8
        WHEN r.text ~* '\m(how to|tutorial|guide)\m' THEN 0.6
        WHEN r.text ~* '\m(near me|in \w+|local)\m' THEN 1.3
        WHEN r.text ~* '\m(bad|worst|terrible|avoid)\m' THEN 1.0
        ELSE 0.7
      END,
      difficulty = CASE
        WHEN r.text ~* '\m(best|top|leading)\m' AND r.text !~* '\m(vs|versus|versus)\m' THEN 2
        WHEN r.text ~* '\m(vs\.?|versus)\m' THEN 4
        WHEN r.text ~* '\m(buy|sign up|price|cost)\m' THEN 4
        WHEN r.text ~* '\m(local|near me|in \w+)\m' THEN 5
        WHEN r.text ~* '\m(negative|bad|worst|avoid)\m' THEN 4
        WHEN r.text ~* '\m(how to|tutorial|guide)\m' THEN 3
        ELSE 3
      END
    WHERE id = r.id;
  END LOOP;
END $$;

COMMIT;
