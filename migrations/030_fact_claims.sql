-- Migration 030: Hallucination / accuracy-correction workflow (Epic H)

CREATE TABLE IF NOT EXISTS fact_claims (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  claim text NOT NULL,
  llm_answer_id varchar REFERENCES llm_answers(id) ON DELETE SET NULL,
  engine varchar,
  accuracy varchar NOT NULL DEFAULT 'unverified',
  severity varchar NOT NULL DEFAULT 'medium',
  correct_value text,
  explanation text,
  status varchar NOT NULL DEFAULT 'open',
  correction_task_id varchar REFERENCES agent_tasks(id) ON DELETE SET NULL,
  detected_at timestamp DEFAULT now(),
  resolved_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fact_claims_brand_idx ON fact_claims (brand_id);
CREATE INDEX IF NOT EXISTS fact_claims_status_idx ON fact_claims (status);
