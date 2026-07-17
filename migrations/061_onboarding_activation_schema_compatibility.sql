-- Onboarding activation schema compatibility fixes.
-- Purpose:
--   Align older production competitor tables with the current LLM sampling
--   worker so onboarding activation can start successfully.
--
-- Safety:
--   - Adds missing columns only.
--   - Does not delete, recreate, or overwrite existing brands/accounts/users.
--   - Backfills the provider rotation index to the app default of 0.

BEGIN;

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS last_provider_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sampled_at timestamp;

UPDATE competitors
SET last_provider_index = 0
WHERE last_provider_index IS NULL;

COMMIT;
