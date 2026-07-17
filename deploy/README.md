# AIRank Deployment Guide

## Prerequisites
- EC2 Ubuntu 22.04 instance (recommended: t3.medium or larger)
- Domain name pointed to EC2 public IP
- SSH key configured

## One-Time Server Setup

1. SSH into your EC2 instance:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

2. Run setup (replace `airank.io`):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/yourrepo/main/deploy/setup.sh | DOMAIN=airank.io sudo bash
   ```
   Or upload setup.sh and run:
   ```bash
   DOMAIN=airank.io sudo bash setup.sh
   ```

3. Note the output — it shows your DATABASE_URL, pgAdmin password, SESSION_SECRET.

4. Copy the template and fill in your API keys:
   ```bash
   cp /opt/airank/.env.template /opt/airank/.env
   nano /opt/airank/.env
   ```

## Every Deploy (from local machine)

```bash
bash deploy/upload.sh ubuntu@your-ec2-ip
```

This will:
1. Upload source files (rsync, skips node_modules/dist/.git)
2. Run `npm ci` (install deps)
3. Run `npm run build` (compile)
4. Run pending SQL migrations automatically
5. Restart PM2 with new build
6. Health check

## Manual Deploy (on server)

```bash
cd /opt/airank
sudo bash deploy/deploy.sh
```

## Database

- **psql**: `psql $DATABASE_URL`
- **pgAdmin**: `https://airank.io/pgadmin` (email/password from setup output)
- **Run migration manually**: `psql $DATABASE_URL -f migrations/009_something.sql`

## Logs

```bash
pm2 logs airank          # live logs
pm2 logs airank --lines 100  # last 100 lines
tail -f /opt/airank/logs/pm2-error.log
```

## Useful Commands

```bash
pm2 status                 # app status
pm2 restart airank       # restart
pm2 reload airank        # zero-downtime reload
systemctl status nginx     # nginx status
systemctl status postgresql  # postgres status
certbot renew --dry-run    # test SSL renewal
```

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SESSION_SECRET | Yes | JWT signing secret (min 32 chars) |
| NODE_ENV | Yes | Set to `production` |
| OPENAI_API_KEY | Conditional | At least one LLM key required |
| RAZORPAY_KEY_ID | Conditional | Required for payments |
| RAZORPAY_KEY_SECRET | Conditional | Required for payments |
| RAZORPAY_WEBHOOK_SECRET | Conditional | Required for payment webhooks |

See `.env.example` in project root for full list.
