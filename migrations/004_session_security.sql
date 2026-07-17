-- ============================================
-- Migration 004: Session Security & Login Attempts
-- ============================================
-- Description: Add tables for session management, login attempt tracking, and security audit
-- Created: 2026-02-15
-- ============================================

-- Login attempts tracking (for rate limiting and account lockout)
CREATE TABLE IF NOT EXISTS login_attempts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR NOT NULL,
  ip_address VARCHAR NOT NULL,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason VARCHAR, -- 'invalid_password', 'account_locked', 'email_not_verified', etc.
  attempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_attempted_at ON login_attempts(attempted_at);

-- Account lockouts (temporary locks after failed attempts)
CREATE TABLE IF NOT EXISTS account_lockouts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMP NOT NULL,
  reason VARCHAR NOT NULL DEFAULT 'too_many_failed_attempts',
  lock_count INTEGER NOT NULL DEFAULT 1, -- How many times locked
  ip_address VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_lockouts_user_id ON account_lockouts(user_id);
CREATE INDEX idx_account_lockouts_email ON account_lockouts(email);
CREATE INDEX idx_account_lockouts_locked_until ON account_lockouts(locked_until);

-- Active sessions (for session management and tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR NOT NULL UNIQUE,
  ip_address VARCHAR NOT NULL,
  user_agent TEXT,
  device_info JSONB, -- Browser, OS, device type
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMP,
  revoke_reason VARCHAR -- 'logout', 'password_change', 'admin_revoke', 'suspicious_activity'
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity);

-- Security events (comprehensive audit log for security-related events)
CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR NOT NULL, -- 'login', 'logout', 'password_change', 'failed_login', 'account_locked', 'session_expired', 'suspicious_activity', 'payment_attempt', etc.
  severity VARCHAR NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  ip_address VARCHAR,
  user_agent TEXT,
  metadata JSONB, -- Additional context
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);

-- Password history (prevent password reuse)
CREATE TABLE IF NOT EXISTS password_history (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_history_user_id ON password_history(user_id);
CREATE INDEX idx_password_history_created_at ON password_history(created_at);

-- Add columns to users table for security features
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR;

-- Function to clean up expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < NOW() AND is_active = TRUE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old login attempts (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM login_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old security events (keep last 90 days for non-critical, 1 year for critical)
CREATE OR REPLACE FUNCTION cleanup_old_security_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM security_events
  WHERE severity != 'critical' AND created_at < NOW() - INTERVAL '90 days';
  
  DELETE FROM security_events
  WHERE severity = 'critical' AND created_at < NOW() - INTERVAL '1 year';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Migration Complete
-- ============================================

