#!/bin/bash
set -euo pipefail

# ============================================================================
# Ubuntu Server Cleanup Script
# ============================================================================
# This script removes common web applications, services, and configurations
# to prepare for a fresh Verarta deployment
#
# WARNING: This will remove data and configurations!
# Make sure you have backups if needed.
#
# Run as: sudo bash cleanup-server.sh
# ============================================================================

echo "========================================"
echo "Ubuntu Server Cleanup Script"
echo "========================================"
echo ""
echo "⚠️  WARNING: This will remove:"
echo "   - Docker containers, images, and volumes"
echo "   - Web servers (Nginx, Apache)"
echo "   - Databases (MySQL, PostgreSQL, MongoDB)"
echo "   - Node.js applications (PM2 processes)"
echo "   - Old application directories"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [[ "$confirm" != "yes" ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo ""
echo "Starting cleanup..."
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

# ============================================================================
# 1. Stop and Remove Docker Containers
# ============================================================================
echo "[1/10] Cleaning Docker..."
if command -v docker &> /dev/null; then
    echo "  → Stopping all containers..."
    docker ps -aq | xargs -r docker stop || true

    echo "  → Removing all containers..."
    docker ps -aq | xargs -r docker rm || true

    echo "  → Removing all images..."
    docker images -aq | xargs -r docker rmi -f || true

    echo "  → Removing all volumes..."
    docker volume ls -q | xargs -r docker volume rm || true

    echo "  → Removing all networks (except defaults)..."
    docker network ls | grep -v "bridge\|host\|none" | awk 'NR>1 {print $1}' | xargs -r docker network rm || true

    echo "  → Pruning system..."
    docker system prune -af --volumes || true

    echo "  ✓ Docker cleaned"
else
    echo "  → Docker not installed, skipping"
fi

# ============================================================================
# 2. Stop and Remove PM2 Processes
# ============================================================================
echo ""
echo "[2/10] Cleaning PM2 processes..."
if command -v pm2 &> /dev/null; then
    echo "  → Stopping all PM2 processes..."
    pm2 kill || true

    # Remove PM2 startup scripts
    pm2 unstartup || true

    echo "  ✓ PM2 processes cleaned"
else
    echo "  → PM2 not installed, skipping"
fi

# ============================================================================
# 3. Stop and Remove Nginx
# ============================================================================
echo ""
echo "[3/10] Cleaning Nginx..."
if command -v nginx &> /dev/null; then
    echo "  → Stopping Nginx..."
    systemctl stop nginx || true
    systemctl disable nginx || true

    echo "  → Removing Nginx configurations..."
    rm -rf /etc/nginx/sites-enabled/*
    rm -rf /etc/nginx/sites-available/*
    rm -rf /var/www/html/*

    echo "  → Purging Nginx package..."
    apt-get purge -y nginx nginx-common nginx-core || true

    echo "  ✓ Nginx removed"
else
    echo "  → Nginx not installed, skipping"
fi

# ============================================================================
# 4. Stop and Remove Apache
# ============================================================================
echo ""
echo "[4/10] Cleaning Apache..."
if command -v apache2 &> /dev/null; then
    echo "  → Stopping Apache..."
    systemctl stop apache2 || true
    systemctl disable apache2 || true

    echo "  → Purging Apache package..."
    apt-get purge -y apache2* || true

    echo "  ✓ Apache removed"
else
    echo "  → Apache not installed, skipping"
fi

# ============================================================================
# 5. Stop and Remove MySQL
# ============================================================================
echo ""
echo "[5/10] Cleaning MySQL..."
if command -v mysql &> /dev/null; then
    echo "  → Stopping MySQL..."
    systemctl stop mysql || true
    systemctl disable mysql || true

    echo "  → Purging MySQL package..."
    apt-get purge -y mysql-server mysql-client mysql-common || true
    rm -rf /var/lib/mysql
    rm -rf /etc/mysql

    echo "  ✓ MySQL removed"
else
    echo "  → MySQL not installed, skipping"
fi

# ============================================================================
# 6. Stop and Remove PostgreSQL
# ============================================================================
echo ""
echo "[6/10] Cleaning PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "  → Stopping PostgreSQL..."
    systemctl stop postgresql || true
    systemctl disable postgresql || true

    echo "  → Purging PostgreSQL package..."
    apt-get purge -y postgresql* || true
    rm -rf /var/lib/postgresql
    rm -rf /etc/postgresql

    echo "  ✓ PostgreSQL removed"
else
    echo "  → PostgreSQL not installed, skipping"
fi

# ============================================================================
# 7. Stop and Remove MongoDB
# ============================================================================
echo ""
echo "[7/10] Cleaning MongoDB..."
if command -v mongod &> /dev/null; then
    echo "  → Stopping MongoDB..."
    systemctl stop mongod || true
    systemctl disable mongod || true

    echo "  → Purging MongoDB package..."
    apt-get purge -y mongodb* || true
    rm -rf /var/lib/mongodb
    rm -rf /etc/mongod.conf

    echo "  ✓ MongoDB removed"
else
    echo "  → MongoDB not installed, skipping"
fi

# ============================================================================
# 8. Stop and Remove Redis
# ============================================================================
echo ""
echo "[8/10] Cleaning Redis..."
if command -v redis-server &> /dev/null; then
    echo "  → Stopping Redis..."
    systemctl stop redis-server || true
    systemctl disable redis-server || true

    echo "  → Purging Redis package..."
    apt-get purge -y redis-server || true
    rm -rf /var/lib/redis

    echo "  ✓ Redis removed"
else
    echo "  → Redis not installed, skipping"
fi

# ============================================================================
# 9. Remove Common Application Directories
# ============================================================================
echo ""
echo "[9/10] Cleaning application directories..."
echo "  → Removing /var/www/*..."
rm -rf /var/www/*

echo "  → Removing /opt/apps (if exists)..."
rm -rf /opt/apps

echo "  → Removing /srv/apps (if exists)..."
rm -rf /srv/apps

echo "  → Removing home directory projects..."
for user_home in /home/*; do
    if [[ -d "$user_home/projects" ]]; then
        echo "    → Removing $user_home/projects"
        rm -rf "$user_home/projects"
    fi
    if [[ -d "$user_home/www" ]]; then
        echo "    → Removing $user_home/www"
        rm -rf "$user_home/www"
    fi
done

echo "  ✓ Application directories cleaned"

# ============================================================================
# 10. Clean Package Cache and Unused Dependencies
# ============================================================================
echo ""
echo "[10/10] Cleaning package cache..."
apt-get autoremove -y
apt-get autoclean
apt-get clean

echo "  ✓ Package cache cleaned"

# ============================================================================
# Remove SSL Certificates (Optional)
# ============================================================================
echo ""
read -p "Remove SSL certificates from Let's Encrypt? (yes/no): " remove_ssl
if [[ "$remove_ssl" == "yes" ]]; then
    echo "  → Removing SSL certificates..."
    if command -v certbot &> /dev/null; then
        certbot delete --cert-name verarta.com || true
        rm -rf /etc/letsencrypt/*
    fi
    echo "  ✓ SSL certificates removed"
fi

# ============================================================================
# Remove Node.js and npm (Optional)
# ============================================================================
echo ""
read -p "Remove Node.js and npm? (yes/no): " remove_node
if [[ "$remove_node" == "yes" ]]; then
    echo "  → Removing Node.js and npm..."
    apt-get purge -y nodejs npm || true
    rm -rf /usr/local/lib/node_modules
    rm -rf /usr/local/bin/npm
    rm -rf /usr/local/bin/node
    echo "  ✓ Node.js removed"
fi

# ============================================================================
# Remove Docker (Optional)
# ============================================================================
echo ""
read -p "Remove Docker completely? (yes/no): " remove_docker
if [[ "$remove_docker" == "yes" ]]; then
    echo "  → Removing Docker..."
    apt-get purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin || true
    rm -rf /var/lib/docker
    rm -rf /var/lib/containerd
    rm -rf /etc/docker
    groupdel docker || true
    echo "  ✓ Docker removed"
fi

# ============================================================================
# Clean Logs
# ============================================================================
echo ""
echo "Cleaning logs..."
journalctl --rotate
journalctl --vacuum-time=1s
rm -rf /var/log/*.log
rm -rf /var/log/*.gz
rm -rf /var/log/*/*.log
rm -rf /var/log/*/*.gz
echo "  ✓ Logs cleaned"

# ============================================================================
# Clean Temporary Files
# ============================================================================
echo ""
echo "Cleaning temporary files..."
rm -rf /tmp/*
rm -rf /var/tmp/*
echo "  ✓ Temporary files cleaned"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "========================================"
echo "Cleanup Complete!"
echo "========================================"
echo ""
echo "System has been cleaned. Summary:"
echo "  ✓ Docker containers, images, and volumes removed"
echo "  ✓ Web servers removed (Nginx, Apache)"
echo "  ✓ Databases removed (MySQL, PostgreSQL, MongoDB, Redis)"
echo "  ✓ PM2 processes stopped"
echo "  ✓ Application directories cleaned"
echo "  ✓ Package cache cleaned"
echo "  ✓ Logs cleaned"
echo ""

# Show disk space
echo "Current disk usage:"
df -h / | tail -1
echo ""

echo "Next steps:"
echo "1. Reboot the server (recommended): sudo reboot"
echo "2. Run setup-server.sh to install fresh dependencies"
echo "3. Run deploy.sh to deploy Verarta"
echo ""
