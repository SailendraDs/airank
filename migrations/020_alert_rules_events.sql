-- Migration 020: Alert rules & events (Epic K)
-- Real alert rules with email/Slack/Teams delivery + alert_evaluation worker support.

CREATE TABLE IF NOT EXISTS alert_rules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  metric varchar NOT NULL,
  comparator varchar NOT NULL DEFAULT 'lt',
  threshold real,
  channel varchar NOT NULL DEFAULT 'email',
  destination text,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamp,
  cooldown_minutes integer NOT NULL DEFAULT 360,
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_rules_brand_idx ON alert_rules (brand_id);

CREATE TABLE IF NOT EXISTS alert_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id varchar REFERENCES alert_rules(id) ON DELETE CASCADE,
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  metric varchar NOT NULL,
  severity varchar NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  value real,
  previous_value real,
  channel varchar,
  delivery_status varchar NOT NULL DEFAULT 'pending',
  delivery_error text,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_events_brand_idx ON alert_events (brand_id);
CREATE INDEX IF NOT EXISTS alert_events_rule_idx ON alert_events (rule_id);
