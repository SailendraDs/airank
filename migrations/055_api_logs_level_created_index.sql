-- Support filtered admin API log pages ordered by newest first.
CREATE INDEX IF NOT EXISTS api_logs_level_created_idx
  ON api_logs(level, created_at DESC);
