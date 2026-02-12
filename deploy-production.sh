#!/bin/bash
set -euo pipefail

# ============================================================================
# Verarta One-Command Production Deployment
# ============================================================================
# Usage: bash deploy-production.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="/opt/verarta"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Verarta Production Deployment                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Step 1: Check if running as root
# ============================================================================
if [[ $EUID -eq 0 ]]; then
   log_error "Please do NOT run this script with sudo"
   log_info "Run as normal user: bash deploy-production.sh"
   log_info "The script will prompt for sudo when needed"
   exit 1
fi

# Check if user can sudo
if ! sudo -n true 2>/dev/null; then
    log_info "This script needs sudo access for some operations"
    log_info "You will be prompted for your password when needed"
    echo ""
fi

# ============================================================================
# Step 2: Check Prerequisites
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 1: Checking Prerequisites"
echo "════════════════════════════════════════════════════════════════"
echo ""

MISSING_DEPS=()

# Check Docker
if ! command -v docker &> /dev/null; then
    log_warning "Docker not found"
    MISSING_DEPS+=("docker")
else
    log_success "Docker installed: $(docker --version)"
fi

# Check Docker Compose
if ! docker compose version &> /dev/null 2>&1; then
    log_warning "Docker Compose not found"
    MISSING_DEPS+=("docker-compose")
else
    log_success "Docker Compose installed: $(docker compose version)"
fi

# Check Node.js
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]]; then
    log_warning "Node.js 20+ not found"
    MISSING_DEPS+=("nodejs")
else
    log_success "Node.js installed: $(node -v)"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    log_warning "npm not found"
    MISSING_DEPS+=("npm")
else
    log_success "npm installed: $(npm -v)"
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    log_warning "PM2 not found"
    MISSING_DEPS+=("pm2")
else
    log_success "PM2 installed: $(pm2 -v)"
fi

# Check Nginx
if ! command -v nginx &> /dev/null; then
    log_warning "Nginx not found"
    MISSING_DEPS+=("nginx")
else
    log_success "Nginx installed: $(nginx -v 2>&1)"
fi

# Check Certbot
if ! command -v certbot &> /dev/null; then
    log_warning "Certbot not found"
    MISSING_DEPS+=("certbot")
else
    log_success "Certbot installed: $(certbot --version 2>&1 | head -1)"
fi

# Check Python3
if ! command -v python3 &> /dev/null; then
    log_warning "Python3 not found"
    MISSING_DEPS+=("python3")
else
    log_success "Python3 installed: $(python3 --version)"
fi

# ============================================================================
# Step 3: Install Missing Dependencies
# ============================================================================
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo ""
    log_warning "Missing dependencies: ${MISSING_DEPS[*]}"
    echo ""
    read -p "Install missing dependencies? (yes/no): " -r
    if [[ $REPLY =~ ^[Yy]es$ ]] || [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installing prerequisites..."
        bash "$SCRIPT_DIR/deployment/setup-server.sh"

        log_success "Prerequisites installed!"
        log_warning "Please log out and log back in for group changes to take effect"
        log_info "Then run this script again: bash deploy-production.sh"
        exit 0
    else
        log_error "Cannot proceed without required dependencies"
        log_info "Run: sudo bash deployment/setup-server.sh"
        exit 1
    fi
fi

# ============================================================================
# Step 4: Create Deployment Directory
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 2: Setting Up Deployment Directory"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [[ ! -d "$DEPLOY_DIR" ]]; then
    log_info "Creating $DEPLOY_DIR..."
    sudo mkdir -p "$DEPLOY_DIR"
    sudo chown -R "$(whoami):$(whoami)" "$DEPLOY_DIR"
fi

# Copy current repo to deployment directory
log_info "Copying files to $DEPLOY_DIR..."
sudo rsync -av --exclude='.git' --exclude='node_modules' "$SCRIPT_DIR/" "$DEPLOY_DIR/app/"
sudo chown -R "$(whoami):$(whoami)" "$DEPLOY_DIR"

cd "$DEPLOY_DIR/app"
log_success "Files copied to $DEPLOY_DIR/app"

# ============================================================================
# Step 5: Build Docker Image
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 3: Building Blockchain Docker Image"
echo "════════════════════════════════════════════════════════════════"
echo ""

if docker images | grep -q "verarta/spring.*latest"; then
    log_info "Docker image verarta/spring:latest already exists"
    read -p "Rebuild Docker image? This takes ~2 hours (yes/no): " -r
    if [[ $REPLY =~ ^[Yy]es$ ]] || [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Building Spring Docker image (this will take ~2 hours)..."
        nice -n 19 docker build -t verarta/spring:latest blockchain/
        log_success "Docker image built successfully!"
    else
        log_info "Using existing Docker image"
    fi
else
    log_info "Building Spring Docker image (this will take ~2 hours)..."
    log_info "You can monitor progress in another terminal with: docker ps"
    echo ""
    nice -n 19 docker build -t verarta/spring:latest blockchain/
    log_success "Docker image built successfully!"
fi

# ============================================================================
# Step 6: Configure Environment
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 4: Configuring Environment"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [[ ! -f backend/.env ]]; then
    log_info "Creating backend/.env from example..."
    cp backend/.env.example backend/.env

    # Generate secrets
    JWT_SECRET=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)

    # Update .env with generated secrets
    sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
    sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" backend/.env

    log_success "Created backend/.env with generated secrets"
    log_warning "You still need to configure:"
    echo "  - SMTP credentials (for email)"
    echo "  - CHAIN_ID (after blockchain starts)"
    echo ""
    log_info "Edit now? (you can skip and edit later)"
    read -p "Open backend/.env in nano? (yes/no): " -r
    if [[ $REPLY =~ ^[Yy]es$ ]] || [[ $REPLY =~ ^[Yy]$ ]]; then
        nano backend/.env
    fi
else
    log_success "backend/.env already exists"
fi

# ============================================================================
# Step 7: Start Docker Services
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 5: Starting Blockchain Services"
echo "════════════════════════════════════════════════════════════════"
echo ""

log_info "Starting Docker Compose services..."
docker compose up -d

log_info "Waiting for services to start (30 seconds)..."
sleep 30

echo ""
log_info "Service Status:"
docker compose ps

# ============================================================================
# Step 8: Get Chain ID
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 6: Getting Chain ID"
echo "════════════════════════════════════════════════════════════════"
echo ""

log_info "Waiting for blockchain to be ready..."
sleep 10

CHAIN_ID=""
for i in {1..10}; do
    if CHAIN_ID=$(curl -sf http://localhost:8888/v1/chain/get_info | grep -o '"chain_id":"[^"]*"' | cut -d'"' -f4); then
        log_success "Chain ID: $CHAIN_ID"

        # Update .env with chain ID
        sed -i "s/^CHAIN_ID=.*/CHAIN_ID=$CHAIN_ID/" backend/.env
        log_success "Updated backend/.env with CHAIN_ID"
        break
    fi
    log_warning "Blockchain not ready yet, retrying... ($i/10)"
    sleep 5
done

if [[ -z "$CHAIN_ID" ]]; then
    log_error "Could not get chain ID. Check if blockchain is running:"
    log_info "  docker compose logs producer1"
fi

# ============================================================================
# Step 9: Bootstrap Blockchain
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 7: Bootstrapping Blockchain"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if Python dependencies are installed
if ! python3 -c "import requests" &> /dev/null; then
    log_info "Installing Python dependencies..."
    pip3 install requests python-dotenv
fi

log_info "Generating blockchain accounts..."
python3 blockchain/scripts/generate-accounts.py

log_info "Running bootstrap script..."
python3 blockchain/scripts/bootstrap.py

log_success "Blockchain bootstrapped!"

# ============================================================================
# Step 10: Install Backend Dependencies
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 8: Installing Backend Dependencies"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd backend

if [[ ! -d node_modules ]]; then
    log_info "Installing npm packages..."
    npm ci --production
else
    log_info "node_modules exists, skipping npm install"
fi

# ============================================================================
# Step 11: Build Backend
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 9: Building Backend"
echo "════════════════════════════════════════════════════════════════"
echo ""

log_info "Building Astro backend..."
npm run build

log_success "Backend built successfully!"

# ============================================================================
# Step 12: Start Backend with PM2
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 10: Starting Backend with PM2"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Stop existing PM2 process if running
if pm2 list | grep -q "verarta-backend"; then
    log_info "Stopping existing backend process..."
    pm2 stop verarta-backend
    pm2 delete verarta-backend
fi

log_info "Starting backend with PM2..."
pm2 start dist/server/entry.mjs --name verarta-backend

log_info "Saving PM2 configuration..."
pm2 save

log_success "Backend started!"

# ============================================================================
# Step 13: Configure Nginx
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 11: Configuring Nginx"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [[ ! -f /etc/nginx/sites-available/verarta.com ]]; then
    log_info "Installing Nginx configuration..."
    sudo cp "$DEPLOY_DIR/app/deployment/nginx-verarta.conf" /etc/nginx/sites-available/verarta.com

    # Create symlink
    sudo ln -sf /etc/nginx/sites-available/verarta.com /etc/nginx/sites-enabled/

    # Remove default site
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test configuration
    if sudo nginx -t; then
        log_info "Reloading Nginx..."
        sudo systemctl reload nginx
        log_success "Nginx configured successfully!"
    else
        log_error "Nginx configuration test failed"
    fi
else
    log_success "Nginx already configured"
fi

# ============================================================================
# Step 14: SSL Configuration (Optional)
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 12: SSL Configuration"
echo "════════════════════════════════════════════════════════════════"
echo ""

log_info "Configure SSL certificates with Let's Encrypt?"
log_warning "Make sure your DNS is properly configured first!"
echo ""
read -p "Configure SSL now? (yes/no): " -r
if [[ $REPLY =~ ^[Yy]es$ ]] || [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Running Certbot..."
    sudo certbot --nginx \
        -d verarta.com \
        -d www.verarta.com \
        -d chain.verarta.com \
        -d hyperion.verarta.com \
        -d explorer.verarta.com

    if [[ $? -eq 0 ]]; then
        log_success "SSL certificates installed!"
    else
        log_error "SSL configuration failed. You can run it manually later:"
        log_info "  sudo certbot --nginx -d verarta.com -d www.verarta.com ..."
    fi
else
    log_info "Skipping SSL configuration"
    log_info "You can configure it later with:"
    log_info "  sudo certbot --nginx -d verarta.com -d www.verarta.com -d chain.verarta.com"
fi

# ============================================================================
# Step 15: Setup PM2 Startup
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 13: Configuring PM2 Startup"
echo "════════════════════════════════════════════════════════════════"
echo ""

log_info "Configuring PM2 to start on boot..."
STARTUP_CMD=$(pm2 startup | tail -1)
eval "$STARTUP_CMD"
pm2 save

log_success "PM2 configured to start on boot!"

# ============================================================================
# Deployment Complete!
# ============================================================================
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Deployment Complete! 🎉                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

log_success "Verarta is now deployed and running!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Service URLs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  🌐 Main Application:  https://verarta.com"
echo "  ⛓️  Chain API:         https://chain.verarta.com"
echo "  📊 Block Explorer:     https://explorer.verarta.com"
echo "  🔍 Hyperion API:       https://hyperion.verarta.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Quick Commands:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Check services:     docker compose ps && pm2 status"
echo "  View logs:          pm2 logs verarta-backend"
echo "  Blockchain logs:    docker compose logs -f producer1"
echo "  Chain info:         curl http://localhost:8888/v1/chain/get_info"
echo "  Restart backend:    pm2 restart verarta-backend"
echo "  Restart blockchain: docker compose restart"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Review backend/.env and update SMTP credentials if needed"
echo "  2. Deploy smart contracts (see deployment/DEPLOYMENT_GUIDE.md)"
echo "  3. Test all endpoints"
echo "  4. Set up monitoring and backups"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
