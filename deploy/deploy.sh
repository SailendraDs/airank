#!/bin/bash
# =============================================================
# GeoScore — Deploy Script (run after uploading new code)
# Run as: bash deploy/deploy.sh
# From:   /opt/geoscore/
# =============================================================
set -euo pipefail

APP_DIR="/opt/geoscore"
APP_USER="geoscore"

log() { echo -e "\033[1;32m[DEPLOY]\033[0m $1"; }
die() { echo -e "\033[1;31m[ERROR]\033[0m $1"; exit 1; }

cd "$APP_DIR" || die "Cannot find app directory: $APP_DIR"

# ─── Check .env exists ────────────────────────────────────────
[[ -f "$APP_DIR/.env" ]] || die ".env not found. Copy .env.template to .env and fill in values."

# Load .env for this script
set -a; source "$APP_DIR/.env"; set +a

# ─── Check DATABASE_URL ───────────────────────────────────────
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set in .env"
[[ -n "${SESSION_SECRET:-}" ]] || die "SESSION_SECRET not set in .env"

log "Starting deployment..."
log "App: $APP_DIR"
log "Node: $(node --version)"

# ─── 1. Install dependencies ──────────────────────────────────
log "Installing dependencies..."
npm ci --prefer-offline --no-audit 2>&1 | tail -5

# ─── 2. Build ─────────────────────────────────────────────────
log "Building application..."
npm run build

# ─── 3. Run database migrations ───────────────────────────────
log "Running database migrations..."
MIGRATION_FILES=$(ls migrations/*.sql 2>/dev/null | sort || echo "")

if [[ -z "$MIGRATION_FILES" ]]; then
  log "No migration files found — skipping."
else
  # Create migration tracking table if missing
  psql "$DATABASE_URL" -c "
    CREATE TABLE IF NOT EXISTS _migrations (
      filename VARCHAR PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    );
  " 2>/dev/null || true

  for migration in $MIGRATION_FILES; do
    filename=$(basename "$migration")
    already_applied=$(psql "$DATABASE_URL" -t -c \
      "SELECT COUNT(*) FROM _migrations WHERE filename='$filename';" 2>/dev/null | tr -d ' ' || echo "0")

    if [[ "$already_applied" == "0" ]]; then
      log "Applying migration: $filename"
      psql "$DATABASE_URL" -f "$migration"
      psql "$DATABASE_URL" -c "INSERT INTO _migrations (filename) VALUES ('$filename');"
      log "  ✓ $filename applied"
    else
      log "  → $filename already applied, skipping"
    fi
  done
fi

# ─── 4. Set permissions ───────────────────────────────────────
chown -R "$APP_USER:$APP_USER" "$APP_DIR" 2>/dev/null || true

# ─── 5. Start / Restart PM2 ───────────────────────────────────
log "Restarting application with PM2..."
if pm2 list | grep -q "geoscore"; then
  pm2 reload geoscore --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi

pm2 save

# ─── 6. Health check ──────────────────────────────────────────
log "Waiting for app to start..."
sleep 3

MAX_ATTEMPTS=10
ATTEMPT=0
while [[ $ATTEMPT -lt $MAX_ATTEMPTS ]]; do
  if curl -sf "http://localhost:5000/health" > /dev/null 2>&1; then
    log "Health check passed!"
    break
  fi
  ATTEMPT=$((ATTEMPT+1))
  [[ $ATTEMPT -lt $MAX_ATTEMPTS ]] && sleep 2 || die "Health check failed after $((MAX_ATTEMPTS * 2)) seconds. Check: pm2 logs geoscore"
done

echo ""
echo "============================================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================================"
pm2 list
echo "============================================================"
