-- Support filtered admin audit-log pages ordered by newest first.
CREATE INDEX IF NOT EXISTS audit_logs_brand_created_idx
  ON audit_logs(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx
  ON audit_logs(user_id, created_at DESC);
