#!/bin/bash
set -euo pipefail

# ============================================================================
# Verarta Redeploy Script
# ============================================================================
# Deploys local changes to verarta.com production server.
# Run from the project root on your development machine.
#
# Usage:
#   bash deployment/redeploy.sh              # deploy everything
#   bash deployment/redeploy.sh backend      # backend only
#   bash deployment/redeploy.sh frontend     # frontend only
# ============================================================================

SSH_HOST="ubuntu@verarta.com"

# Production paths (these differ — verify with `pm2 describe` if issues arise)
BACKEND_DIR="/home/ubuntu/dev/verarta.com/backend"
FRONTEND_DIR="/opt/verarta/app/frontend"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

TARGET="${1:-all}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[done]${NC}  $1"; }
fail() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ── Verify SSH ──────────────────────────────────────────────────────────────
log "Testing SSH connection..."
ssh -o ConnectTimeout=5 "$SSH_HOST" "echo ok" >/dev/null 2>&1 || fail "Cannot SSH to $SSH_HOST"

# ── Backend ─────────────────────────────────────────────────────────────────
deploy_backend() {
  log "Syncing backend source to $SSH_HOST:$BACKEND_DIR/src ..."
  rsync -av --delete \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.env' \
    "$PROJECT_ROOT/backend/src/" \
    "$SSH_HOST:$BACKEND_DIR/src/"

  log "Building backend on server..."
  ssh "$SSH_HOST" "cd $BACKEND_DIR && npm run build"

  log "Restarting backend PM2 process..."
  ssh "$SSH_HOST" "pm2 restart verarta-backend"

  ok "Backend deployed"
}

# ── Frontend ────────────────────────────────────────────────────────────────
deploy_frontend() {
  log "Syncing frontend source to $SSH_HOST:$FRONTEND_DIR/src ..."
  rsync -av --delete \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.env*' \
    "$PROJECT_ROOT/frontend/src/" \
    "$SSH_HOST:$FRONTEND_DIR/src/"

  # Also sync config files that affect the build
  rsync -av \
    "$PROJECT_ROOT/frontend/next.config.ts" \
    "$PROJECT_ROOT/frontend/tailwind.config.ts" \
    "$PROJECT_ROOT/frontend/tsconfig.json" \
    "$PROJECT_ROOT/frontend/package.json" \
    "$SSH_HOST:$FRONTEND_DIR/" 2>/dev/null || true

  log "Building frontend on server..."
  ssh "$SSH_HOST" "cd $FRONTEND_DIR && npm run build"

  log "Restarting frontend PM2 process..."
  ssh "$SSH_HOST" "pm2 restart verarta-frontend"

  ok "Frontend deployed"
}

# ── Run ─────────────────────────────────────────────────────────────────────
case "$TARGET" in
  backend)
    deploy_backend
    ;;
  frontend)
    deploy_frontend
    ;;
  all)
    deploy_backend
    deploy_frontend
    ;;
  *)
    fail "Unknown target: $TARGET (use: all, backend, frontend)"
    ;;
esac

echo ""
log "Verifying services..."
ssh "$SSH_HOST" "pm2 list"
echo ""
ok "Deployment complete — https://verarta.com"
