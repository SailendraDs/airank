# AIRank Admin Setup Guide

This document explains how to create and manage admin accounts in AIRank.

## Creating an Admin Account

### Method 1: Via SQL (Recommended)

Connect to your PostgreSQL database and promote an existing user:

```sql
-- Find the user you want to promote
SELECT id, email FROM users WHERE email = 'your-email@example.com';

-- Promote to admin
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

### Method 2: Via psql CLI

```bash
psql "$DATABASE_URL" -c "UPDATE users SET is_admin = true WHERE email = 'your-email@example.com'"
```

## First-Time Setup

1. Sign up at the application's signup page (`/signup`)
2. Complete the onboarding flow
3. Use Method 1 or 2 above to promote your account to admin
4. Log out and back in to access admin features

## Admin Features

Admins can access:
- **Admin Dashboard** — system-wide analytics and monitoring
- **User Management** — view, manage, and support users
- **Brand Management** — oversee all brands on the platform
- **Prompt Templates** — create and manage LLM prompt templates
- **Plan Management** — configure subscription tiers and capabilities
- **Job Monitoring** — track background job execution
- **API Usage** — monitor LLM provider usage and costs
- **Operations** — manage admin ops tasks and evidence workflows

## Security Best Practices

- Admin accounts should use strong, unique passwords
- Admin access is logged to the `audit_logs` table
- Only promote trusted email addresses
- Never commit admin credentials to version control
- Use the `.env` file for all configuration — never hardcode secrets

## Database Reference

The admin flag is stored in the `users` table:

| Field | Description |
|-------|-------------|
| `is_admin` | Boolean — set to `true` for admin access |
| `email` | User's email address (unique identifier) |
| `id` | UUID primary key |
