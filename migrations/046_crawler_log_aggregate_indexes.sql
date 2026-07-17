-- Speed up crawler analytics aggregates by brand and time window.

CREATE INDEX IF NOT EXISTS crawler_logs_brand_visited_idx
  ON crawler_logs(brand_id, visited_at);

CREATE INDEX IF NOT EXISTS crawler_logs_brand_engine_visited_idx
  ON crawler_logs(brand_id, engine, visited_at);

CREATE INDEX IF NOT EXISTS crawler_logs_brand_path_visited_idx
  ON crawler_logs(brand_id, path, visited_at);
