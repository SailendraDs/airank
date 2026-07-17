-- Entity Presence onboarding compatibility fixes.
-- Purpose:
--   Ensure the Topics-step "Establish Entity Presence" fields can persist on
--   older production databases.
--
-- Safety:
--   - Adds missing columns only.
--   - Does not delete or overwrite existing users, brands, subscriptions, or
--     account data.

BEGIN;

ALTER TABLE entity_profile
  ADD COLUMN IF NOT EXISTS entity_description text;

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS links jsonb DEFAULT '{}'::jsonb;

COMMIT;
