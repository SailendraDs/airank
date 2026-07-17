-- Support brand-specific admin analytics aggregates without loading raw event rows.
CREATE INDEX IF NOT EXISTS idx_analytics_brand_page_created
  ON user_analytics_events(brand_id, page_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_brand_session_created
  ON user_analytics_events(brand_id, session_id, created_at DESC);
