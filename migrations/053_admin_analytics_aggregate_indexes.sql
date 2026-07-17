-- Support admin analytics aggregate reads by event type, brand, and date window.
CREATE INDEX IF NOT EXISTS idx_analytics_event_created
  ON user_analytics_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_brand_event_created
  ON user_analytics_events(brand_id, event_type, created_at DESC);
