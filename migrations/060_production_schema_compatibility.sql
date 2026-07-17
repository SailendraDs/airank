-- Production schema compatibility fixes.
-- Purpose:
--   Align older production databases with the current application schema without
--   deleting or overwriting existing users, accounts, brands, subscriptions, or
--   customer records.
--
-- Notes:
--   - Adds missing columns only when absent.
--   - Backfills new compatibility columns from existing brand data.
--   - Leaves all existing brand/account rows in place.

BEGIN;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS website text;

UPDATE brands
SET url = CASE
  WHEN domain ~* '^https?://' THEN domain
  ELSE 'https://' || domain
END
WHERE url IS NULL
  AND domain IS NOT NULL
  AND btrim(domain) <> '';

UPDATE brands
SET website = COALESCE(url, CASE
  WHEN domain ~* '^https?://' THEN domain
  ELSE 'https://' || domain
END)
WHERE website IS NULL
  AND domain IS NOT NULL
  AND btrim(domain) <> '';

COMMIT;
