-- Support operational dashboard, reporting, alert, and job-history reads.
CREATE INDEX IF NOT EXISTS report_schedules_brand_created_idx
  ON report_schedules(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS report_schedules_active_next_run_idx
  ON report_schedules(is_active, next_run_at);

CREATE INDEX IF NOT EXISTS alert_rules_brand_created_idx
  ON alert_rules(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS alert_rules_active_idx
  ON alert_rules(is_active);

CREATE INDEX IF NOT EXISTS alert_events_brand_created_idx
  ON alert_events(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_runs_job_created_idx
  ON job_runs(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_errors_job_created_idx
  ON job_errors(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_errors_resolved_created_idx
  ON job_errors(is_resolved, created_at DESC);
