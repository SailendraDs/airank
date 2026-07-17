#!/bin/bash
# =============================================================
# GeoScore — Upload & Deploy from Local Machine
# Usage: bash deploy/upload.sh ec2-user@your-ec2-ip
# =============================================================
set -euo pipefail

TARGET="${1:-}"
[[ -n "$TARGET" ]] || { echo "Usage: bash deploy/upload.sh ec2-user@your-ec2-ip"; exit 1; }

APP_DIR="/opt/geoscore"

log() { echo -e "\033[1;32m[UPLOAD]\033[0m $1"; }

log "Uploading project to $TARGET:$APP_DIR ..."

# Sync all files except node_modules, dist, .git, logs
rsync -avz --progress \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.git/' \
  --exclude='logs/' \
  --exclude='.env' \
  --exclude='*.local' \
  . "$TARGET:$APP_DIR/"

log "Upload complete."
log "Running deploy script on server..."

ssh "$TARGET" "cd $APP_DIR && sudo bash deploy/deploy.sh"
