#!/bin/bash
set -euo pipefail

# ============================================================================
# Verarta Deployment Script
# ============================================================================
# Deploys the Verarta application to production server
# Run on the production server as: bash deploy.sh
# ============================================================================

DEPLOY_DIR="/opt/verarta"
REPO_URL="${REPO_URL:-https://github.com/yourusername/verarta.com.git}"

echo "========================================"
echo "Verarta Deployment"
echo "========================================"
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "Do not run this script as root"
   exit 1
fi

echo "[1/8] Creating deployment directory..."
sudo mkdir -p "$DEPLOY_DIR"
sudo chown -R "$(whoami):$(whoami)" "$DEPLOY_DIR"

echo ""
echo "[2/8] Cloning repository..."
if [[ ! -d "$DEPLOY_DIR/app/.git" ]]; then
    git clone "$REPO_URL" "$DEPLOY_DIR/app"
else
    echo "Repository already exists, pulling latest changes..."
    cd "$DEPLOY_DIR/app"
    git pull
fi

cd "$DEPLOY_DIR/app"

echo ""
echo "[3/8] Building Spring Docker image..."
echo "This will take approximately 2 hours..."
if ! docker images | grep -q "verarta/spring.*latest"; then
    nice -n 19 docker build -t verarta/spring:latest blockchain/
else
    echo "verarta/spring:latest already exists. Skipping build."
    echo "To rebuild, run: docker build -t verarta/spring:latest blockchain/"
fi

echo ""
echo "[4/8] Setting up environment files..."
# Backend environment
if [[ ! -f backend/.env ]]; then
    if [[ -f backend/.env.example ]]; then
        cp backend/.env.example backend/.env
        echo "Created backend/.env from example"
        echo "⚠️  IMPORTANT: Edit backend/.env with your configuration before continuing"
    else
        echo "⚠️  WARNING: backend/.env.example not found"
    fi
else
    echo "backend/.env already exists"
fi

echo ""
echo "[5/8] Starting blockchain services..."
docker compose up -d

echo ""
echo "Waiting for services to start (30 seconds)..."
sleep 30

echo ""
echo "[6/8] Checking service health..."
docker compose ps

echo ""
echo "[7/8] Installing backend dependencies..."
cd backend
npm ci --production

echo ""
echo "[8/8] Building backend..."
npm run build

echo ""
echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your configuration"
echo "2. Bootstrap the blockchain: python3 blockchain/scripts/generate-accounts.py"
echo "3. Run: python3 blockchain/scripts/bootstrap.py"
echo "4. Configure SSL: sudo certbot --nginx -d verarta.com -d www.verarta.com"
echo "5. Start backend: pm2 start backend/dist/server/entry.mjs --name verarta-backend"
echo "6. Save PM2 config: pm2 save && pm2 startup"
echo ""
