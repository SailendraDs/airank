-- Align job history tables with shared/schema.ts for local and production deploys.

CREATE TABLE IF NOT EXISTS job_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  run_number integer NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  duration integer,
  result jsonb,
  error text,
  logs text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_errors (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_run_id varchar REFERENCES job_runs(id) ON DELETE CASCADE,
  error_type text NOT NULL,
  error_message text NOT NULL,
  stack_trace text,
  context jsonb,
  is_resolved boolean DEFAULT false,
  resolved_at timestamp,
  resolved_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

ALTER TABLE job_errors
  ADD COLUMN IF NOT EXISTS job_run_id varchar REFERENCES job_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_resolved boolean DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_errors'
      AND column_name = 'resolved'
  ) THEN
    EXECUTE 'UPDATE job_errors SET is_resolved = resolved WHERE is_resolved IS DISTINCT FROM resolved';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS job_runs_job_id_idx ON job_runs(job_id);
CREATE INDEX IF NOT EXISTS job_runs_status_idx ON job_runs(status);
CREATE INDEX IF NOT EXISTS job_errors_job_id_idx ON job_errors(job_id);
CREATE INDEX IF NOT EXISTS job_errors_is_resolved_idx ON job_errors(is_resolved);
