-- Speed up admin analytics views that filter by user/brand/event/session over a date window.
CREATE INDEX IF NOT EXISTS idx_analytics_user_created
  ON user_analytics_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_brand_created
  ON user_analytics_events(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_user_event_created
  ON user_analytics_events(user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_user_session_created
  ON user_analytics_events(user_id, session_id, created_at DESC);
