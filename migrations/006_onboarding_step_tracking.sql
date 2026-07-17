-- Migration: Add onboarding step tracking to users table
-- This allows users to resume onboarding from where they left off

-- Add onboarding_step column to track current step (1-6)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;

-- Add index for faster queries on onboarding status
CREATE INDEX IF NOT EXISTS idx_users_onboarding_step ON users(onboarding_step);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON users(onboarding_completed);

-- Update existing users who have completed onboarding to step 6
UPDATE users SET onboarding_step = 6 WHERE onboarding_completed = true AND onboarding_step = 1;

