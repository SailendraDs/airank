-- Migration 009: Add system settings table + seed admin settings keys
-- Run: psql $DATABASE_URL -f migrations/009_system_settings.sql

CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR
);

INSERT INTO system_settings (key, value)
VALUES
  -- Security
  ('require_admin_2fa', 'false'),
  ('session_timeout_minutes', '30'),
  ('max_login_attempts', '5'),

  -- Payments
  ('razorpay_key_id', ''),
  ('razorpay_key_secret', ''),
  ('razorpay_webhook_secret', ''),

  -- LLM API keys
  ('openai_api_key', ''),
  ('anthropic_api_key', ''),
  ('google_ai_api_key', ''),
  ('perplexity_api_key', ''),
  ('grok_api_key', ''),
  ('deepseek_api_key', ''),
  ('openrouter_api_key', ''),

  -- Email provider + SMTP
  ('email_provider', 'smtp'),
  ('smtp_host', ''),
  ('smtp_port', '587'),
  ('smtp_user', ''),
  ('smtp_pass', ''),
  ('smtp_from', ''),

  -- SES SMTP
  ('ses_smtp_host', 'email-smtp.ap-south-1.amazonaws.com'),
  ('ses_smtp_port', '587'),
  ('ses_smtp_user', ''),
  ('ses_smtp_pass', ''),
  ('ses_from_email', ''),

  -- OAuth
  ('google_client_id', ''),
  ('google_client_secret', ''),
  ('google_callback_url', ''),

  -- Notifications
  ('notify_security_alerts', 'true'),
  ('notify_system_updates', 'true'),
  ('notify_new_signups', 'false')
ON CONFLICT (key) DO NOTHING;
