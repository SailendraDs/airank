-- Speed up admin user enrichment and active-session lookups.

CREATE INDEX IF NOT EXISTS brands_user_created_idx
  ON brands(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_last_activity_idx
  ON user_sessions(user_id, is_active, last_activity DESC);

CREATE INDEX IF NOT EXISTS user_sessions_token_active_expires_idx
  ON user_sessions(session_token, is_active, expires_at);
