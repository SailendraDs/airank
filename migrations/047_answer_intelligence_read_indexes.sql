-- Speed up answer intelligence/report reads that filter by brand and sort newest-first.

CREATE INDEX IF NOT EXISTS llm_answers_brand_created_idx
  ON llm_answers(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS answer_mentions_brand_created_idx
  ON answer_mentions(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS answer_mentions_brand_competitor_created_idx
  ON answer_mentions(brand_id, is_competitor, created_at DESC);

CREATE INDEX IF NOT EXISTS optimization_logs_brand_created_idx
  ON optimization_logs(brand_id, created_at DESC);
