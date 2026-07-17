-- Migration 022: Public AI Report Card leads (Epic N)
-- Captures domains analyzed via the public lead magnet and email-gated unlocks.

CREATE TABLE IF NOT EXISTS report_card_leads (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  email text,
  brand_name text,
  teaser_score real,
  full_report jsonb,
  unlocked boolean NOT NULL DEFAULT false,
  ip_hash varchar,
  user_agent text,
  converted_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  unlocked_at timestamp
);

CREATE INDEX IF NOT EXISTS report_card_leads_domain_idx ON report_card_leads (domain);
CREATE INDEX IF NOT EXISTS report_card_leads_email_idx ON report_card_leads (email);
