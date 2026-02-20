#!/bin/bash
set -euo pipefail

# ============================================================================
# Verarta Production Server Setup Script
# ============================================================================
# This script installs all prerequisites on a fresh Ubuntu 22.04 server
# Run as: sudo bash setup-server.sh
# ============================================================================

echo "========================================"
echo "Verarta Server Setup"
echo "========================================"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

echo "[1/7] Updating system packages..."
apt-get update
apt-get upgrade -y

echo ""
echo "[2/7] Installing Docker..."
# Install Docker
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Add current user to docker group
    if [[ -n "${SUDO_USER:-}" ]]; then
        usermod -aG docker "$SUDO_USER"
        echo "Added $SUDO_USER to docker group"
    fi
else
    echo "Docker already installed"
fi

echo ""
echo "[3/7] Installing Docker Compose..."
# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

echo ""
echo "[4/7] Installing Node.js 20..."
# Install Node.js
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "Node.js 20+ already installed"
fi

echo ""
echo "[5/7] Installing PM2 process manager..."
npm install -g pm2

echo ""
echo "[6/7] Installing Nginx..."
apt-get install -y nginx

echo ""
echo "[7/7] Installing SSL tools..."
apt-get install -y certbot python3-certbot-nginx

echo ""
echo "========================================"
echo "Additional tools..."
echo "========================================"
apt-get install -y git curl wget htop net-tools python3 python3-pip

echo ""
echo "========================================"
echo "Python dependencies for blockchain scripts..."
echo "========================================"
pip3 install requests python-dotenv

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Log out and log back in (for Docker group to take effect)"
echo "2. Run: docker --version"
echo "3. Run: node --version"
echo "4. Continue with deployment script"
echo ""
echo "NOTE: The Hyperion History API Docker image must be built from source."
echo "See deployment/DEPLOYMENT_GUIDE.md Step 5b for instructions."
echo "Hyperion requires Elasticsearch 9.x (not 8.x) — already set in docker-compose.yml."
echo ""
