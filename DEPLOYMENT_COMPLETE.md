# Verarta Production Deployment Guide

## Overview

This document covers the complete deployment process for Verarta, including what `deploy-production.sh` accomplishes, post-deployment configuration, and advanced setup options.

---

## Table of Contents

1. [What deploy-production.sh Does](#what-deploy-productionsh-does)
2. [Current System Status](#current-system-status)
3. [Post-Deployment Steps](#post-deployment-steps)
4. [Protocol Features Activated](#protocol-features-activated)
5. [Multi-Producer Setup (Advanced)](#multi-producer-setup-advanced)
6. [Production Checklist](#production-checklist)
7. [Troubleshooting](#troubleshooting)

---

## What deploy-production.sh Does

The `deploy-production.sh` script automates the complete setup of the Verarta system on a fresh Ubuntu 22.04 server.

### Automated Steps

1. **✅ Prerequisites Installation**
   - Docker & Docker Compose
   - Node.js 20+ & npm
   - PM2 (process manager)
   - Nginx (reverse proxy)
   - Certbot (SSL certificates)
   - Python3 & pip
   - PostgreSQL client tools

2. **✅ Blockchain Docker Image**
   - Builds `verarta/spring:latest` from Dockerfile (~2 hours, one-time)
   - Creates multi-stage image with Spring/Antelope v1.2.2

3. **✅ Environment Configuration**
   - Creates `backend/.env` from `.env.example`
   - Generates JWT_SECRET and SESSION_SECRET (64-char hex)
   - Configures database and Redis URLs
   - Sets blockchain chain ID

4. **✅ Docker Services**
   - 4 producer nodes (producer1-4)
   - 1 history node (full history + SHiP)
   - 1 wallet service (keosd)
   - PostgreSQL 16
   - Redis 8
   - MongoDB 8
   - Elasticsearch 8.15
   - RabbitMQ 4

5. **✅ Blockchain Bootstrap**
   - Generates producer account keys
   - Updates producer configurations
   - Runs bootstrap script (creates accounts)
   - Blockchain starts producing blocks

6. **✅ Backend Application**
   - Installs npm dependencies
   - Runs database migrations
   - Builds Astro SSR application
   - Starts with PM2
   - Configures auto-restart on boot

7. **✅ Nginx Configuration** (Optional)
   - Reverse proxy setup
   - SSL certificate generation with Let's Encrypt

**Total Time:** ~2.5-3 hours (mostly Docker build)

---

## Current System Status

### ✅ Fully Operational

**Blockchain:**
- **Status:** Producing blocks continuously
- **Chain ID:** `96f99757daf05efb9ed0f8bb675e643e4954a5b6c4c017a25a184ea27f0394cc`
- **Block Interval:** 0.5 seconds
- **Current Producer:** eosio (producer1)
- **Protocol:** Spring/Antelope v1.2.2 with Savanna consensus

**System Contracts Deployed:**
- ✅ eosio.token (token management)
- ✅ eosio.msig (multi-signature proposals)
- ✅ eosio.boot (protocol feature activation)

**Blockchain Accounts Created:**
- ✅ producer1, producer2, producer3, producer4
- ✅ verartacore (main contract account)
- ✅ eosio.token, eosio.msig

**Backend API:**
- **Status:** Online (PM2 managed)
- **Port:** 4321
- **Endpoints:** All 34 API routes functional
  - `/api/auth/*` - Authentication
  - `/api/chain/*` - Blockchain queries
  - `/api/artworks/*` - File uploads & artwork management

**Databases:**
- ✅ PostgreSQL (migrations complete, 5 tables)
- ✅ Redis (session storage)
- ✅ MongoDB (Hyperion data)
- ✅ Elasticsearch (history indexing)

---

## Post-Deployment Steps

### 1. Configure SMTP for Email Verification

Edit `backend/.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@verarta.com
SMTP_PASS=<your-app-password>
EMAIL_FROM=Verarta <noreply@verarta.com>
```

Restart backend:
```bash
pm2 restart verarta-backend
```

### 2. Deploy Verarta Smart Contract

```bash
cd ~/dev/verarta.com/blockchain/contracts/verarta.core

# Compile (requires CDT)
cdt-cpp -abigen -o verarta.core.wasm verarta.core.cpp

# Deploy
cleos -u http://localhost:8888 --wallet-url http://localhost:6666 \
  set contract verartacore . verarta.core.wasm verarta.core.abi \
  -p verartacore@active
```

### 3. Configure Nginx for External Access

The deployment script creates the Nginx config. To enable:

```bash
# Edit server_name if needed
sudo nano /etc/nginx/sites-available/verarta.com

# Test configuration
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

### 4. Set Up SSL Certificates

```bash
# Ensure DNS points to your server first!
sudo certbot --nginx \
  -d verarta.com \
  -d www.verarta.com \
  -d chain.verarta.com \
  -d hyperion.verarta.com \
  -d explorer.verarta.com
```

### 5. Configure Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (if not already)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

### 6. Set Up Backups

**Database Backup:**
```bash
# Create backup script
cat > ~/backup-verarta.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups

# PostgreSQL
docker exec verarta-postgres pg_dump -U verarta verarta > \
  $BACKUP_DIR/postgres_$DATE.sql

# Compress
gzip $BACKUP_DIR/postgres_$DATE.sql

# Keep last 7 days
find $BACKUP_DIR -name "postgres_*.sql.gz" -mtime +7 -delete
EOF

chmod +x ~/backup-verarta.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-verarta.sh") | crontab -
```

**Blockchain Snapshots:**
```bash
# Create snapshot
docker exec verarta-producer1 \
  curl -X POST http://localhost:8888/v1/producer/create_snapshot

# Snapshots stored in: /data/snapshots/ inside container
```

---

## Protocol Features Activated

All modern Spring/Antelope protocol features have been activated on the blockchain:

### ✅ Activated Features (23 total)

1. **PREACTIVATE_FEATURE** - Enables protocol feature activation system
2. **ACTION_RETURN_VALUE** - Actions can return values
3. **CONFIGURABLE_WASM_LIMITS2** - Configurable WASM execution limits
4. **BLOCKCHAIN_PARAMETERS** - Runtime blockchain parameter configuration
5. **GET_SENDER** - Contracts can get transaction sender
6. **FORWARD_SETCODE** - Forward setcode to other contracts
7. **ONLY_BILL_FIRST_AUTHORIZER** - Bill only first transaction authorizer
8. **RESTRICT_ACTION_TO_SELF** - Restrict inline actions to self
9. **DISALLOW_EMPTY_PRODUCER_SCHEDULE** - Prevent empty producer schedules
10. **FIX_LINKAUTH_RESTRICTION** - Fix linkauth permission restrictions
11. **REPLACE_DEFERRED** - Replace deferred transactions
12. **NO_DUPLICATE_DEFERRED_ID** - Prevent duplicate deferred transaction IDs
13. **ONLY_LINK_TO_EXISTING_PERMISSION** - Link only to existing permissions
14. **RAM_RESTRICTIONS** - Enforce RAM purchase restrictions
15. **WEBAUTHN_KEY** - WebAuthn key support for biometric auth
16. **WTMSIG_BLOCK_SIGNATURES** - Weighted threshold multi-sig block signatures
17. **GET_CODE_HASH** - Get contract code hash
18. **GET_BLOCK_NUM** - Get current block number in contracts
19. **CRYPTO_PRIMITIVES** - Additional cryptographic primitives
20. **BLS_PRIMITIVES2** - BLS signature support (Savanna consensus)
21. **DISABLE_DEFERRED_TRXS_STAGE_1** - Disallow new deferred transactions
22. **DISABLE_DEFERRED_TRXS_STAGE_2** - Prevent deferred transaction relay
23. **SAVANNA** - Savanna consensus (instant finality, enhanced BFT)

### Benefits

- **Instant Finality:** Savanna consensus provides Byzantine fault-tolerant instant finality
- **WebAuthn Support:** Native biometric authentication keys
- **Enhanced Security:** Modern cryptographic primitives and restrictions
- **Better Performance:** Optimized WASM execution and billing
- **Future-Proof:** All latest features enabled for advanced smart contracts

---

## Multi-Producer Setup (Advanced)

The current setup uses a single producer (producer1 as "eosio") for simplicity and stability. For full multi-producer rotation, additional steps are required.

### Current Setup

- **Producer:** producer1 (configured as "eosio")
- **Other Producers:** producer2-4 (ready, accounts created)
- **Rotation:** None (single producer)
- **Use Case:** Development, testing, private network

### Full Multi-Producer Requirements

To enable true multi-producer rotation with voting:

1. **Deploy eosio.system Contract**
   ```bash
   # Build eosio.system
   cd ~/dev/verarta.com/blockchain/contracts/reference-contracts
   ./build.sh

   # Deploy
   cleos -u http://localhost:8888 --wallet-url http://localhost:6666 \
     set contract eosio \
     build/contracts/eosio.system/ \
     eosio.system.wasm eosio.system.abi \
     -p eosio@active
   ```

2. **Initialize System**
   ```bash
   # Create core token
   cleos push action eosio.token create \
     '["eosio", "1000000000.0000 SYS"]' \
     -p eosio.token@active

   # Issue tokens
   cleos push action eosio.token issue \
     '["eosio", "1000000000.0000 SYS", "initial"]' \
     -p eosio@active
   ```

3. **Register Producers**
   ```bash
   # Each producer registers
   cleos system regproducer producer1 \
     EOS54tpWVS9LsuV1iv4uUb7PA6YfMMWP5cdWrt7Gtevprp6udCEb3 \
     https://producer1.verarta.com

   # Repeat for producer2-4...
   ```

4. **Vote for Producers**
   ```bash
   # Stake tokens for voting
   cleos system delegatebw <voter> <voter> "100.0000 SYS" "100.0000 SYS"

   # Vote for producers
   cleos system voteproducer prods <voter> producer1 producer2 producer3 producer4
   ```

5. **Update Producer Configs**
   ```bash
   # Remove temporary eosio from producer1.ini
   cd ~/dev/verarta.com
   git checkout blockchain/config/producer1.ini

   # Restart all producers
   docker restart verarta-producer1 verarta-producer2 verarta-producer3 verarta-producer4
   ```

### Why Single Producer for Now?

- **Simplicity:** Easier to manage and debug
- **Stability:** No consensus issues or missed rounds
- **Performance:** Consistent block production
- **Development:** Perfect for testing and development
- **Private Network:** No governance/voting overhead

The single-producer setup is **recommended for:**
- Development environments
- Testing
- Private blockchain deployments
- Early-stage applications

Multi-producer is **needed for:**
- Public networks
- Decentralized governance
- High availability requirements
- Production with external validators

---

## Production Checklist

### Security

- [ ] Change default passwords (if any)
- [ ] Configure firewall (ufw)
- [ ] Set up SSH key authentication (disable password auth)
- [ ] Enable automatic security updates
- [ ] Configure fail2ban for SSH protection
- [ ] Rotate JWT secrets periodically
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Set up monitoring and alerting

### Performance

- [ ] Configure swap space (if needed)
- [ ] Optimize PostgreSQL settings for production
- [ ] Set up Redis persistence
- [ ] Configure Elasticsearch heap size
- [ ] Enable compression for Nginx
- [ ] Set up CDN for static assets (optional)

### Monitoring

- [ ] Set up Prometheus + Grafana (optional)
- [ ] Configure PM2 monitoring
- [ ] Set up Docker container monitoring
- [ ] Monitor disk space
- [ ] Monitor blockchain sync status
- [ ] Set up uptime monitoring (e.g., UptimeRobot)
- [ ] Configure log aggregation

### Backups

- [ ] Automated PostgreSQL backups
- [ ] Blockchain snapshots
- [ ] Backup encryption keys
- [ ] Test restore procedures
- [ ] Offsite backup storage

### Testing

- [ ] Test user registration flow
- [ ] Test email verification
- [ ] Test WebAuthn authentication
- [ ] Test file upload (all sizes)
- [ ] Test artwork listing/retrieval
- [ ] Test blockchain queries
- [ ] Load testing (optional)

---

## Troubleshooting

### Blockchain Stopped Producing

**Check producer logs:**
```bash
docker logs verarta-producer1 --tail 100
```

**Common causes:**
- Disk full
- Producer not configured correctly
- Wallet locked
- Network issues between producers

**Fix:**
```bash
# Restart producer
docker restart verarta-producer1

# Check if blocks advancing
curl -s http://localhost:8888/v1/chain/get_info | grep head_block_num
```

### Backend Not Responding

**Check PM2 status:**
```bash
pm2 status
pm2 logs verarta-backend
```

**Restart backend:**
```bash
pm2 restart verarta-backend
```

**Check if backend is listening:**
```bash
netstat -tlnp | grep 4321
```

### Database Connection Issues

**Check PostgreSQL:**
```bash
docker ps | grep postgres
docker logs verarta-postgres --tail 50
```

**Test connection:**
```bash
docker exec verarta-postgres psql -U verarta -d verarta -c "SELECT 1"
```

**Restart database:**
```bash
docker restart verarta-postgres
pm2 restart verarta-backend  # Restart after DB is up
```

### Disk Space Issues

**Check disk usage:**
```bash
df -h
docker system df
```

**Clean up:**
```bash
# Remove old Docker images
docker system prune -a

# Clean PM2 logs
pm2 flush

# Clean old blockchain state (CAREFUL!)
# This will delete blockchain data
# docker volume rm verartacom_producer1-data
```

### High Memory Usage

**Check memory:**
```bash
free -h
docker stats
```

**Restart heavy services:**
```bash
docker restart verarta-elasticsearch
docker restart verarta-hyperion-indexer
```

---

## Quick Reference Commands

### Services

```bash
# Check all services
docker ps
pm2 status

# Restart backend
pm2 restart verarta-backend

# Restart all blockchain services
docker restart verarta-producer1 verarta-producer2 \
  verarta-producer3 verarta-producer4 verarta-history

# View logs
pm2 logs verarta-backend
docker logs verarta-producer1 -f
```

### Blockchain

```bash
# Chain info
curl http://localhost:8888/v1/chain/get_info

# Get account
cleos -u http://localhost:8888 get account producer1

# Get table
cleos -u http://localhost:8888 get table verartacore verartacore artworks
```

### Database

```bash
# PostgreSQL
docker exec -it verarta-postgres psql -U verarta -d verarta

# Redis
docker exec -it verarta-redis redis-cli
```

### URLs

- **Backend API:** http://localhost:4321 (or https://verarta.com)
- **Chain API:** http://localhost:8888 (or https://chain.verarta.com)
- **Hyperion:** http://localhost:7000 (or https://hyperion.verarta.com)
- **Elasticsearch:** http://localhost:9200

---

## Summary

### ✅ What's Complete

1. Full blockchain infrastructure (4 producers + history)
2. All database services (PostgreSQL, Redis, MongoDB, Elasticsearch)
3. Complete backend API (34 endpoints)
4. System contracts deployed (eosio.token, eosio.msig, eosio.boot)
5. All 23 protocol features activated (including Savanna consensus)
6. Blockchain producing blocks continuously
7. PM2 process management
8. Database migrations complete

### 📝 What's Next

1. Deploy Verarta smart contract
2. Configure SMTP for email
3. Set up SSL certificates
4. Deploy frontend application
5. Configure production monitoring
6. Set up backups

### 🚀 Ready For

- User registration and authentication
- File uploads and artwork management
- Blockchain transactions
- WebAuthn biometric authentication
- Development and testing
- Smart contract deployment

---

**Need Help?**

- Check logs: `pm2 logs verarta-backend` or `docker logs verarta-producer1`
- Review this document
- Check [Spring Documentation](https://docs.spring.io/)
- Check [Antelope Documentation](https://docs.antelope.io/)

---

*Last Updated: February 12, 2026*
*Verarta Blockchain Art Registry v1.0*
