# Verarta Production Deployment Guide

This guide will help you deploy the complete Verarta application to your production server.

## Server Specifications
- **OS**: Ubuntu 22.04 LTS
- **RAM**: 32GB
- **Storage**: 1.7TB SSD
- **CPU**: 8 cores
- **Domain**: verarta.com (DNS configured)

---

## Pre-Deployment Checklist

- [ ] SSH access to server configured
- [ ] Domain DNS pointing to server IP
- [ ] Server firewall configured (ports 80, 443, 22)
- [ ] Backup strategy planned

---

## Step 1: Prepare Your Local Repository

Before deploying, ensure your local repository is ready:

```bash
# On your local machine
cd /home/ami/dev/work/verarta.com

# Commit all changes
git add .
git commit -m "Prepare for production deployment"

# Push to your remote repository (GitHub/GitLab)
git push origin main
```

**Note**: Update `REPO_URL` in `deployment/deploy.sh` with your actual repository URL.

---

## Step 2: Copy Deployment Files to Server

```bash
# Replace USER and SERVER with your SSH details
# Example: ssh user@verarta.com or ssh user@192.168.1.100

# Copy deployment directory to server
scp -r deployment/ USER@SERVER:~/

# SSH into the server
ssh USER@SERVER
```

---

## Step 3: Run Server Setup Script

This installs Docker, Node.js, Nginx, and other prerequisites:

```bash
# On the server
cd ~/deployment
sudo bash setup-server.sh
```

This will take 5-10 minutes. After completion:

```bash
# Log out and log back in for Docker group to take effect
exit

# SSH back in
ssh USER@SERVER

# Verify installations
docker --version
docker compose version
node --version
pm2 --version
nginx -v
```

---

## Step 4: Run Deployment Script

```bash
# On the server
cd ~/deployment

# Set your repository URL (update with your actual repo)
export REPO_URL="https://github.com/yourusername/verarta.com.git"

# Run deployment
bash deploy.sh
```

This script will:
1. Clone the repository to `/opt/verarta/app`
2. Build the Spring Docker image (~2 hours)
3. Create environment file template
4. Start blockchain services
5. Install and build backend

**⚠️ The Docker build will take approximately 2 hours. You can monitor progress:**

```bash
# In another terminal, monitor Docker build
docker ps
docker logs -f <container-id>
```

---

## Step 5: Configure Environment Variables

```bash
cd /opt/verarta/app

# Edit backend environment
nano backend/.env
```

**Required configurations**:

1. **CHAIN_ID**: Get from blockchain after it starts
   ```bash
   curl http://localhost:8888/v1/chain/get_info | jq -r .chain_id
   ```

2. **JWT_SECRET** and **SESSION_SECRET**: Generate secure random strings
   ```bash
   openssl rand -hex 32
   ```

3. **SMTP credentials**: Your email service credentials

4. **Database passwords**: Update if you changed PostgreSQL defaults

Save and exit (Ctrl+X, Y, Enter).

---

## Step 6: Bootstrap the Blockchain

```bash
cd /opt/verarta/app

# Generate blockchain accounts
python3 blockchain/scripts/generate-accounts.py

# Run bootstrap script
python3 blockchain/scripts/bootstrap.py

# Verify blockchain is running
curl http://localhost:8888/v1/chain/get_info
```

Expected output should show:
- `chain_id`: Your chain's unique ID
- `head_block_producer`: One of your producers (prod1, prod2, prod3, or prod4)
- `server_version`: v1.2.2

---

## Step 7: Deploy Smart Contracts

**Note**: This requires `eosio.cdt` (Contract Development Toolkit). If not installed:

```bash
# Download and install eosio.cdt 4.1.0
wget https://github.com/AntelopeIO/cdt/releases/download/v4.1.0/cdt_4.1.0_amd64.deb
sudo apt install ./cdt_4.1.0_amd64.deb
```

Then deploy contracts:

```bash
cd /opt/verarta/app/blockchain/contracts/verarta.core

# Compile contract
cdt-cpp -abigen -o verarta.core.wasm verarta.core.cpp

# Deploy contract
cleos -u http://localhost:8888 set contract verartacore . \
  verarta.core.wasm verarta.core.abi -p verartacore@active
```

---

## Step 8: Configure Nginx

```bash
# Copy Nginx configuration
sudo cp /opt/verarta/app/deployment/nginx-verarta.conf \
  /etc/nginx/sites-available/verarta.com

# Create symlink
sudo ln -s /etc/nginx/sites-available/verarta.com \
  /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 9: Configure SSL Certificates

```bash
# Get Let's Encrypt certificates for all subdomains
sudo certbot --nginx \
  -d verarta.com \
  -d www.verarta.com \
  -d chain.verarta.com \
  -d hyperion.verarta.com \
  -d explorer.verarta.com

# Certbot will automatically configure Nginx with SSL
```

Follow the prompts:
1. Enter your email address
2. Agree to terms of service
3. Choose to redirect HTTP to HTTPS (recommended)

---

## Step 10: Start Backend Application

```bash
cd /opt/verarta/app/backend

# Run database migrations
npm run db:migrate

# Start with PM2
pm2 start dist/server/entry.mjs --name verarta-backend

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup
# Follow the command it outputs (usually starts with sudo)
```

---

## Step 11: Verify Deployment

### Check All Services

```bash
# Check Docker services
docker compose ps

# Check PM2 process
pm2 status

# Check Nginx
sudo systemctl status nginx
```

### Test Endpoints

```bash
# Test main application
curl https://verarta.com

# Test chain API
curl https://chain.verarta.com/v1/chain/get_info

# Test backend API
curl https://verarta.com/api/health
```

### View Logs

```bash
# Backend logs
pm2 logs verarta-backend

# Docker logs
docker compose logs -f producer1

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Step 12: Firewall Configuration

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Post-Deployment Tasks

### Set Up Monitoring

```bash
# Install monitoring tools
sudo apt install -y prometheus-node-exporter

# Configure log rotation
sudo nano /etc/logrotate.d/verarta
```

Add:
```
/var/log/verarta/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

### Set Up Backups

Create backup script:

```bash
sudo nano /opt/verarta/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/verarta"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup Docker volumes
docker run --rm -v verarta_postgres-data:/data -v "$BACKUP_DIR":/backup \
  ubuntu tar czf "/backup/postgres_$DATE.tar.gz" -C /data .

docker run --rm -v verarta_producer1-data:/data -v "$BACKUP_DIR":/backup \
  ubuntu tar czf "/backup/blockchain_$DATE.tar.gz" -C /data .

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

```bash
sudo chmod +x /opt/verarta/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/verarta/backup.sh") | crontab -
```

### Configure Monitoring Alerts

Set up monitoring with:
- **Prometheus** + **Grafana** for metrics
- **Loki** for log aggregation
- **Uptime Kuma** for uptime monitoring

---

## Troubleshooting

### Blockchain Not Producing Blocks

```bash
# Check producer logs
docker compose logs producer1 | tail -100

# Check if all producers are running
docker compose ps | grep producer

# Verify network connectivity
docker exec verarta-producer1 cleos net peers
```

### Backend Not Starting

```bash
# Check PM2 logs
pm2 logs verarta-backend --lines 100

# Check environment file
cat /opt/verarta/app/backend/.env

# Restart backend
pm2 restart verarta-backend
```

### SSL Certificate Issues

```bash
# Renew certificates manually
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

### High Memory Usage

```bash
# Check memory usage
free -h
docker stats

# Restart services if needed
docker compose restart
pm2 restart all
```

---

## Maintenance Commands

### Update Application

```bash
cd /opt/verarta/app
git pull
npm ci --production
npm run build
pm2 restart verarta-backend
```

### Restart All Services

```bash
# Restart blockchain
docker compose restart

# Restart backend
pm2 restart verarta-backend

# Restart Nginx
sudo systemctl restart nginx
```

### View System Resources

```bash
# CPU and memory
htop

# Disk usage
df -h

# Docker disk usage
docker system df
```

---

## Security Recommendations

1. **Keep System Updated**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Configure Fail2Ban**
   ```bash
   sudo apt install fail2ban
   sudo systemctl enable fail2ban
   ```

3. **Disable Root Login**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   sudo systemctl restart sshd
   ```

4. **Set Up SSH Keys** (disable password auth)

5. **Regular Backups** (automated and tested)

6. **Monitor Logs** for suspicious activity

---

## Getting Help

- **Documentation**: See [README.md](../README.md) and [PLAN.md](../PLAN.md)
- **Logs**: Check PM2 and Docker logs
- **Antelope Docs**: https://docs.antelope.io/
- **Support**: Create an issue in your repository

---

## Quick Reference

### Service URLs

| Service | Internal | External (Domain) |
|---------|----------|-------------------|
| Main App | localhost:4321 | https://verarta.com |
| Chain API | localhost:8888 | https://chain.verarta.com |
| Hyperion | localhost:7000 | https://hyperion.verarta.com |
| Explorer | localhost:4321/explorer | https://explorer.verarta.com |
| PostgreSQL | localhost:5432 | N/A |
| Redis | localhost:6379 | N/A |

### Important Directories

- Application: `/opt/verarta/app`
- Docker volumes: `/var/lib/docker/volumes/verarta_*`
- Logs: `/var/log/verarta/` and PM2 logs
- Nginx config: `/etc/nginx/sites-available/verarta.com`
- SSL certs: `/etc/letsencrypt/live/verarta.com/`

### Quick Commands

```bash
# View all services
docker compose ps && pm2 status

# Restart everything
docker compose restart && pm2 restart all

# View logs
pm2 logs && docker compose logs -f

# Check disk space
df -h && docker system df

# Test blockchain
curl http://localhost:8888/v1/chain/get_info
```

---

**Deployment Complete!** 🎉

Your Verarta application should now be live at https://verarta.com
