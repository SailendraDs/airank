-- Migration 008: Score overrides + refund support
-- Run: psql $DATABASE_URL -f migrations/008_score_overrides_and_refund.sql

-- Admin-controlled visibility score override per brand
ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_override REAL;

-- Admin-controlled competitor mention-rate overrides: { competitorId: percentage }
ALTER TABLE brands ADD COLUMN IF NOT EXISTS competitor_overrides JSONB;

-- Track refund status on payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_id VARCHAR;
