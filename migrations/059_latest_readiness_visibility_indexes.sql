CREATE INDEX IF NOT EXISTS visibility_scores_brand_period_start_idx
  ON visibility_scores (brand_id, period_start);

CREATE INDEX IF NOT EXISTS visibility_scores_brand_period_period_start_idx
  ON visibility_scores (brand_id, period, period_start);

CREATE INDEX IF NOT EXISTS agent_readiness_brand_created_idx
  ON agent_readiness_reports (brand_id, created_at);

CREATE INDEX IF NOT EXISTS agent_readiness_brand_scan_created_idx
  ON agent_readiness_reports (brand_id, scan_type, created_at);
