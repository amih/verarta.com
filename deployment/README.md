# Verarta Deployment Files

This directory contains all scripts and configurations needed to deploy Verarta to production.

## Quick Start

### 1. On Your Local Machine

```bash
# Ensure your repository is up to date
git add .
git commit -m "Production deployment"
git push origin main

# Copy deployment files to server
scp -r deployment/ USER@SERVER:~/

# SSH to server
ssh USER@SERVER
```

### 2. On the Production Server

```bash
# Run setup (installs Docker, Node.js, Nginx, etc.)
cd ~/deployment
sudo bash setup-server.sh

# Log out and back in
exit
ssh USER@SERVER

# Run deployment
cd ~/deployment
export REPO_URL="https://github.com/yourusername/verarta.com.git"
bash deploy.sh
```

### 3. Follow the Deployment Guide

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete step-by-step instructions.

---

## Files in This Directory

### Scripts

- **`setup-server.sh`** - Installs all server prerequisites (Docker, Node.js, Nginx, PM2, SSL tools)
- **`deploy.sh`** - Deploys the application (clones repo, builds Docker image, starts services)

### Configuration Files

- **`nginx-verarta.conf`** - Nginx reverse proxy configuration for all domains
- **`production.env.example`** - Production environment variables template

### Documentation

- **`DEPLOYMENT_GUIDE.md`** - Complete deployment guide with all steps
- **`README.md`** - This file (quick reference)

---

## Server Requirements

- **OS**: Ubuntu 22.04 LTS
- **RAM**: 32GB minimum (64GB recommended)
- **Storage**: 500GB SSD minimum (1TB+ recommended)
- **CPU**: 8 cores minimum
- **Network**: 100 Mbps+ connection

---

## Deployment Overview

```
┌──────────────────────────────────────────────────────┐
│ 1. setup-server.sh                                    │
│    - Install Docker & Docker Compose                  │
│    - Install Node.js 20                               │
│    - Install Nginx                                    │
│    - Install PM2 & SSL tools                          │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│ 2. deploy.sh                                          │
│    - Clone repository                                 │
│    - Build Spring Docker image (~2 hours)             │
│    - Start Docker services                            │
│    - Build backend                                    │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│ 3. Manual Steps (see DEPLOYMENT_GUIDE.md)            │
│    - Configure environment variables                  │
│    - Bootstrap blockchain                             │
│    - Deploy smart contracts                           │
│    - Configure Nginx                                  │
│    - Set up SSL certificates                          │
│    - Start backend with PM2                           │
└──────────────────────────────────────────────────────┘
```

---

## Important Notes

### 1. Repository URL

Update the `REPO_URL` variable in `deploy.sh` with your actual repository URL:

```bash
export REPO_URL="https://github.com/yourusername/verarta.com.git"
```

### 2. DNS Configuration

Ensure these DNS records point to your server:

- `verarta.com` → Server IP
- `www.verarta.com` → Server IP
- `chain.verarta.com` → Server IP
- `hyperion.verarta.com` → Server IP
- `explorer.verarta.com` → Server IP

### 3. Firewall Ports

The following ports need to be accessible:

- **22** - SSH
- **80** - HTTP (redirects to HTTPS)
- **443** - HTTPS

Internal ports (localhost only):
- 4321 - Backend
- 5432 - PostgreSQL
- 6379 - Redis
- 8888 - Chain API
- 9200 - Elasticsearch

### 4. Docker Build Time

The Spring blockchain Docker image build takes approximately **2 hours** on an 8-core system. Plan accordingly.

### 5. SSL Certificates

Let's Encrypt SSL certificates are configured automatically via Certbot in the deployment guide.

---

## Maintenance

### Update Application

```bash
cd /opt/verarta/app
git pull
docker compose restart
pm2 restart verarta-backend
```

### Backup Database

```bash
docker exec verarta-postgres pg_dump -U verarta verarta > backup.sql
```

### View Logs

```bash
# Backend logs
pm2 logs verarta-backend

# Blockchain logs
docker compose logs -f producer1

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

See the **Troubleshooting** section in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for common issues and solutions.

---

## Support

For detailed deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).
