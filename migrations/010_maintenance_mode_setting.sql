-- Migration 010: add maintenance mode setting key
-- Run: psql $DATABASE_URL -f migrations/010_maintenance_mode_setting.sql

INSERT INTO system_settings (key, value)
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
