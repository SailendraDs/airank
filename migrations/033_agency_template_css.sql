-- Migration 033: Add email_template and custom_css columns to agencies

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS email_template text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS custom_css text;
