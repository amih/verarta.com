#!/bin/bash
set -euo pipefail

# ============================================================================
# Ubuntu Server Check Script
# ============================================================================
# This script checks what's currently installed on the server
# Run before cleanup to see what will be removed
#
# Run as: bash check-server.sh
# ============================================================================

echo "========================================"
echo "Ubuntu Server Check"
echo "========================================"
echo ""
echo "Checking installed services and applications..."
echo ""

# ============================================================================
# System Information
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SYSTEM INFORMATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo ""

# ============================================================================
# Resource Usage
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RESOURCE USAGE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CPU Cores: $(nproc)"
echo "Memory:"
free -h | grep -E "Mem|Swap"
echo ""
echo "Disk Usage:"
df -h / | grep -v "Filesystem"
echo ""

# ============================================================================
# Docker
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DOCKER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v docker &> /dev/null; then
    echo "✓ Docker installed: $(docker --version)"

    running_containers=$(docker ps -q | wc -l)
    stopped_containers=$(docker ps -aq | wc -l)
    images=$(docker images -q | wc -l)
    volumes=$(docker volume ls -q | wc -l)

    echo "  Containers (running): $running_containers"
    echo "  Containers (total): $stopped_containers"
    echo "  Images: $images"
    echo "  Volumes: $volumes"

    if [[ $running_containers -gt 0 ]]; then
        echo ""
        echo "  Running containers:"
        docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    fi

    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo ""
        echo "✓ Docker Compose installed: $(docker compose version | head -1)"
    fi

    echo ""
    echo "  Docker disk usage:"
    docker system df
else
    echo "✗ Docker not installed"
fi
echo ""

# ============================================================================
# Web Servers
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "WEB SERVERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Nginx
if command -v nginx &> /dev/null; then
    echo "✓ Nginx installed: $(nginx -v 2>&1 | cut -d'/' -f2)"
    if systemctl is-active --quiet nginx; then
        echo "  Status: Running"
    else
        echo "  Status: Stopped"
    fi

    if [[ -d /etc/nginx/sites-enabled ]]; then
        enabled_sites=$(ls -1 /etc/nginx/sites-enabled 2>/dev/null | wc -l)
        echo "  Enabled sites: $enabled_sites"
        if [[ $enabled_sites -gt 0 ]]; then
            echo "  Sites:"
            ls -1 /etc/nginx/sites-enabled | sed 's/^/    - /'
        fi
    fi
else
    echo "✗ Nginx not installed"
fi

# Apache
if command -v apache2 &> /dev/null; then
    echo "✓ Apache installed: $(apache2 -v 2>&1 | head -1 | cut -d':' -f2)"
    if systemctl is-active --quiet apache2; then
        echo "  Status: Running"
    else
        echo "  Status: Stopped"
    fi
else
    echo "✗ Apache not installed"
fi
echo ""

# ============================================================================
# Databases
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# MySQL
if command -v mysql &> /dev/null; then
    echo "✓ MySQL installed: $(mysql --version | cut -d' ' -f5)"
    if systemctl is-active --quiet mysql; then
        echo "  Status: Running"
    else
        echo "  Status: Stopped"
    fi
else
    echo "✗ MySQL not installed"
fi

# PostgreSQL
if command -v psql &> /dev/null; then
    echo "✓ PostgreSQL installed: $(psql --version | cut -d' ' -f3)"
    if systemctl list-units --type=service --all | grep -q postgresql; then
        if systemctl is-active --quiet postgresql; then
            echo "  Status: Running"
        else
            echo "  Status: Stopped"
        fi
    fi
else
    echo "✗ PostgreSQL not installed"
fi

# MongoDB
if command -v mongod &> /dev/null; then
    echo "✓ MongoDB installed: $(mongod --version | grep 'db version' | cut -d' ' -f3)"
    if systemctl is-active --quiet mongod; then
        echo "  Status: Running"
    else
        echo "  Status: Stopped"
    fi
else
    echo "✗ MongoDB not installed"
fi

# Redis
if command -v redis-server &> /dev/null; then
    echo "✓ Redis installed: $(redis-server --version | cut -d' ' -f3)"
    if systemctl is-active --quiet redis-server; then
        echo "  Status: Running"
    else
        echo "  Status: Stopped"
    fi
else
    echo "✗ Redis not installed"
fi
echo ""

# ============================================================================
# Node.js and PM2
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NODE.JS & PM2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v node &> /dev/null; then
    echo "✓ Node.js installed: $(node --version)"
    echo "✓ npm installed: $(npm --version)"
else
    echo "✗ Node.js not installed"
fi

if command -v pm2 &> /dev/null; then
    echo "✓ PM2 installed: $(pm2 --version)"
    pm2_processes=$(pm2 list | grep -c "online\|stopped\|errored" || echo "0")
    echo "  PM2 processes: $pm2_processes"

    if [[ $pm2_processes -gt 0 ]]; then
        echo ""
        echo "  PM2 process list:"
        pm2 list
    fi
else
    echo "✗ PM2 not installed"
fi
echo ""

# ============================================================================
# SSL/Certbot
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SSL CERTIFICATES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v certbot &> /dev/null; then
    echo "✓ Certbot installed: $(certbot --version 2>&1 | cut -d' ' -f2)"

    if [[ -d /etc/letsencrypt/live ]]; then
        cert_count=$(ls -1 /etc/letsencrypt/live 2>/dev/null | wc -l)
        echo "  SSL certificates: $cert_count"
        if [[ $cert_count -gt 0 ]]; then
            echo "  Domains:"
            ls -1 /etc/letsencrypt/live | sed 's/^/    - /'
        fi
    fi
else
    echo "✗ Certbot not installed"
fi
echo ""

# ============================================================================
# Application Directories
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "APPLICATION DIRECTORIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_dir() {
    local dir=$1
    if [[ -d "$dir" ]] && [[ -n "$(ls -A "$dir" 2>/dev/null)" ]]; then
        size=$(du -sh "$dir" 2>/dev/null | cut -f1)
        echo "✓ $dir ($size)"
    else
        echo "✗ $dir (empty or doesn't exist)"
    fi
}

check_dir "/var/www"
check_dir "/opt/apps"
check_dir "/srv/apps"
check_dir "/opt/verarta"

echo ""

# ============================================================================
# Network Ports
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "LISTENING PORTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v ss &> /dev/null; then
    echo "Common web/database ports in use:"
    ss -tlnp | grep -E ":(80|443|3000|3306|5432|6379|8080|8888|27017)" | \
        awk '{print "  " $4}' | sed 's/.*:/Port: /' || echo "  None"
else
    echo "ss command not available"
fi
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To clean this server, run:"
echo "  sudo bash cleanup-server.sh"
echo ""
echo "To install fresh dependencies, run:"
echo "  sudo bash setup-server.sh"
echo ""
