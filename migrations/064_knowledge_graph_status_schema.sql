-- Entity Intelligence compatibility: per-brand Wikidata/KG status.
-- Additive only; does not alter existing brands, accounts, or entity profile data.

CREATE TABLE IF NOT EXISTS knowledge_graph_status (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id VARCHAR NOT NULL UNIQUE REFERENCES brands(id) ON DELETE CASCADE,
  wikidata_id TEXT,
  entity_label TEXT,
  completeness_score REAL DEFAULT 0,
  missing_claims JSONB,
  existing_claims JSONB,
  sitelink_count INTEGER DEFAULT 0,
  recommendations JSONB,
  last_checked_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_graph_status_brand_idx
  ON knowledge_graph_status(brand_id);
