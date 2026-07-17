-- Migration 011: Add missing metadata column to audit_logs
-- Run: psql $DATABASE_URL -f migrations/011_add_audit_logs_metadata.sql

ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS metadata JSONB;
