-- GeoScore Database Rollback Migration
-- Version: 001
-- Description: Rollback initial schema
-- WARNING: This will delete ALL data!

-- Drop tables in reverse order (respecting foreign key constraints)

DROP TABLE IF EXISTS axp_content CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS recommendations CASCADE;
DROP TABLE IF EXISTS gap_analyses CASCADE;
DROP TABLE IF EXISTS visibility_scores CASCADE;
DROP TABLE IF EXISTS analysis_schedules CASCADE;
DROP TABLE IF EXISTS job_errors CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
DROP TABLE IF EXISTS llm_responses CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;
DROP TABLE IF EXISTS prompts CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS competitors CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS brands CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS plan_capabilities CASCADE;

-- Note: Extensions are not dropped as they may be used by other databases
-- If you need to drop extensions, uncomment the following:
-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Rollback complete

