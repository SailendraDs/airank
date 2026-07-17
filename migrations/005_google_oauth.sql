-- ============================================
-- Migration 005: Google OAuth Support
-- ============================================
-- Description: Add fields for Google OAuth authentication
-- Created: 2026-02-15
-- ============================================

-- Add Google OAuth fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR DEFAULT 'email'; -- 'email', 'google'
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

-- Create index for faster Google ID lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- Update existing users to have terms_accepted = true (grandfathered in)
UPDATE users SET terms_accepted = TRUE, terms_accepted_at = created_at WHERE terms_accepted IS NULL OR terms_accepted = FALSE;

-- ============================================
-- Migration Complete
-- ============================================

