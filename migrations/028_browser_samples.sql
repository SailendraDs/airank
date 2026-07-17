-- Migration 028: Browser-session sampling (Epic A)

CREATE TABLE IF NOT EXISTS browser_samples (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_id varchar REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_text text NOT NULL,
  engine varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  response_text text,
  brand_mentioned boolean DEFAULT false,
  mention_rank integer,
  citations jsonb,
  error text,
  captured_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browser_samples_brand_idx ON browser_samples (brand_id);
CREATE INDEX IF NOT EXISTS browser_samples_engine_idx ON browser_samples (engine);
