CREATE INDEX IF NOT EXISTS prompt_runs_brand_created_idx ON prompt_runs(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS competitors_brand_idx ON competitors(brand_id);
CREATE INDEX IF NOT EXISTS team_members_brand_idx ON team_members(brand_id);
CREATE INDEX IF NOT EXISTS team_members_brand_status_idx ON team_members(brand_id, status);
