-- Add trend_snapshots table required by activation visibility scoring
CREATE TABLE IF NOT EXISTS trend_snapshots (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMP NOT NULL,
  visibility_score REAL DEFAULT 0,
  mention_count INTEGER DEFAULT 0,
  avg_rank REAL DEFAULT 0,
  competitor_count INTEGER DEFAULT 0,
  top_competitor_id VARCHAR REFERENCES competitors(id),
  market_share REAL DEFAULT 0,
  trend_direction TEXT,
  change_percent REAL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trend_snapshots_brand_id_idx
  ON trend_snapshots(brand_id);

CREATE INDEX IF NOT EXISTS trend_snapshots_snapshot_date_idx
  ON trend_snapshots(snapshot_date);
