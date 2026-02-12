# Verarta.com — Blockchain Art Registry

A full-stack blockchain application for registering and managing artwork on a private Antelope/Spring blockchain.

## Features

- **User Registration** — Email verification + WebAuthn biometric authentication
- **Artwork Management** — Upload images/documents with blockchain-backed storage
- **Chunked File Uploads** — Support for files up to 100MB via 256KB chunks
- **Block Explorer** — Browse blocks, transactions, and account history
- **Private Blockchain** — 4-node Antelope/Spring network with 5-second blocks
- **Hyperion Indexing** — Full history API with real-time streaming

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Verarta Application                     │
├─────────────────────────────────────────────────────────────┤
│ Frontend (React + WebAuthn) → Astro SSR Backend             │
│                         ↓                                   │
│              PostgreSQL (users) + Redis (cache)             │
│                         ↓                                   │
│   Antelope Blockchain (4 producers + 1 history node)        │
│                         ↓                                   │
│        Hyperion (Elasticsearch + RabbitMQ + MongoDB)        │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Blockchain Layer
- **Antelope/Spring** v1.2.2 (custom 5s block interval)
- **Hyperion** v3.6+ (history indexing)
- **eosio.cdt** v4.1+ (smart contract development)

### Backend Layer
- **Astro** 5.x (SSR with Node adapter)
- **PostgreSQL** 16 (user database)
- **Redis** 8 (caching)
- **@wharfkit/antelope** (blockchain SDK)

### Frontend Layer
- **React** 19
- **eosjs** 22+ (WebAuthn signing)
- **TanStack Query** 5
- **Tailwind CSS** 4

## Prerequisites

- **Docker** 24+ and **Docker Compose** v2
- **Node.js** 20+ and **npm** 10+
- **Python** 3.10+ (for blockchain bootstrap script)
- **Git**

---

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/verarta.com.git
cd verarta.com
```

### 2. Start the Blockchain Network

```bash
# Build the Spring Docker image (first time only, ~20 minutes)
cd blockchain
docker build -t verarta/spring:latest .

# Start all services (producers, history node, Hyperion stack)
cd ..
docker compose up -d

# Wait for services to be healthy (~2 minutes)
docker compose ps
```

### 3. Bootstrap the Blockchain

```bash
# Generate producer keys and accounts
python3 blockchain/scripts/generate-accounts.py

# Run the bootstrap script (creates system accounts, deploys contracts)
python3 blockchain/scripts/bootstrap.py

# Verify producers are active
curl http://localhost:8888/v1/chain/get_info
```

### 4. Deploy Smart Contracts

```bash
cd blockchain/contracts/verarta.core

# Compile contract (requires eosio.cdt)
cdt-cpp -abigen -o verarta.core.wasm verarta.core.cpp

# Deploy to blockchain
cleos -u http://localhost:8888 set contract verartacore . verarta.core.wasm verarta.core.abi -p verartacore@active
```

### 5. Start Backend (Astro)

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

Backend will be available at `http://localhost:4321`

### 6. Start Frontend (React)

The frontend is integrated into Astro as islands, so it runs with the backend dev server.

### 7. Access Services

| Service | URL | Description |
|---------|-----|-------------|
| **Backend API** | http://localhost:4321 | Astro SSR + API routes |
| **Chain API** | http://localhost:8888 | History node RPC |
| **Hyperion API** | http://localhost:7000 | History indexer REST API |
| **Elasticsearch** | http://localhost:9200 | Search engine |
| **PostgreSQL** | localhost:5432 | User database |
| **Redis** | localhost:6379 | Cache |

---

## Production Deployment

### Prerequisites

- **Ubuntu 22.04** server with at least:
  - 32 GB RAM (64 GB recommended)
  - 500 GB SSD minimum (1TB+ recommended)
  - 8 CPU cores
- **Domain name** pointed to server IP (A records for verarta.com, www, chain, explorer, hyperion)
- **SSH access** to server
- **Clean server** (or run cleanup script first)

### Quick Start: One-Command Deployment

The easiest way to deploy Verarta is with our automated deployment script:

```bash
# 1. SSH to your server
ssh user@verarta.com

# 2. Clone the repository
git clone https://github.com/yourusername/verarta.com.git
cd verarta.com

# 3. Run the deployment script - that's it!
bash deploy-production.sh
```

**What this does:**
- ✅ Checks and installs prerequisites (Docker, Node.js, Nginx, PM2, Certbot)
- ✅ Builds Spring Docker image (~2 hours)
- ✅ Configures environment with auto-generated secrets
- ✅ Starts all blockchain services (4 producers + history node)
- ✅ Bootstraps blockchain with system accounts
- ✅ Builds and starts backend with PM2
- ✅ Configures Nginx reverse proxy
- ✅ Optionally sets up SSL certificates
- ✅ Configures services to start on boot

**Time estimate:** ~2.5 hours (mostly waiting for Docker build)

### Manual Deployment (Advanced)

For more control over the deployment process, see the detailed guide:

**[deployment/DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md)**

### Optional: Clean Server First

If your server has existing applications, clean it first:

```bash
# On server
git clone https://github.com/yourusername/verarta.com.git
cd verarta.com

# Audit what's installed
bash deployment/check-server.sh

# Clean everything (prompts for confirmation)
sudo bash deployment/cleanup-server.sh

# Then run deployment
bash deploy-production.sh
```

### Post-Deployment: Verify Everything Works

```bash
# Check all services are running
docker compose ps
pm2 status

# Test blockchain
curl http://localhost:8888/v1/chain/get_info

# Test backend
curl https://verarta.com

# View logs
pm2 logs verarta-backend
docker compose logs -f producer1
```

### Updating Your Deployment

To update your production deployment with new code:

```bash
# SSH to server
ssh user@verarta.com
cd verarta.com

# Pull latest changes
git pull

# Restart services
docker compose restart
pm2 restart verarta-backend
```

---

## Environment Variables

### Backend (.env)

```env
# Chain
CHAIN_ID=<from-genesis.json>
HISTORY_NODE_URL=http://localhost:8888
PRODUCER_NODE_URL=http://localhost:8000
HYPERION_URL=http://localhost:7000

# Database
DATABASE_URL=postgresql://verarta:password@localhost:5432/verarta
REDIS_URL=redis://localhost:6379

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@verarta.com
SMTP_PASS=<app-password>

# Session
JWT_SECRET=<random-64-char-string>
JWT_EXPIRY=7d

# File Uploads
TEMP_UPLOAD_DIR=/tmp/verarta-uploads
CHUNK_SIZE=262144                  # 256 KB
MAX_FILE_SIZE=104857600            # 100 MB
CLEANUP_INTERVAL_HOURS=1
ABANDONED_UPLOAD_HOURS=24
```

---

## Development Commands

### Blockchain

```bash
# View chain info
curl http://localhost:8888/v1/chain/get_info

# View producer schedule
cleos -u http://localhost:8888 get schedule

# Query contract table
cleos -u http://localhost:8888 get table verartacore verartacore artworks

# Push action
cleos -u http://localhost:8888 push action verartacore createart '["alice", "My Artwork"]' -p alice@active
```

### Backend

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Seed test data
npm run db:reset         # Reset database
```

### Docker

```bash
# View logs
docker compose logs -f                    # All services
docker compose logs -f producer1          # Single service

# Restart services
docker compose restart producer1
docker compose restart hyperion-api

# Reset blockchain (WARNING: deletes all data)
docker compose down -v
docker compose up -d
```

---

## Troubleshooting

### Blockchain not producing blocks

```bash
# Check producer logs
docker compose logs producer1 | tail -50

# Verify peer connections
cleos -u http://localhost:8888 net peers

# Check if nodeos is running
docker compose ps producer1
```

### Hyperion not indexing

```bash
# Check indexer logs
docker compose logs hyperion-indexer | tail -100

# Verify SHiP connection
curl http://localhost:8888/v1/chain/get_info

# Check Elasticsearch health
curl http://localhost:9200/_cluster/health
```

### Backend errors

```bash
# Check PM2 logs
pm2 logs verarta-backend

# Check PostgreSQL connection
psql postgresql://verarta:password@localhost:5432/verarta -c "SELECT 1"

# Restart backend
pm2 restart verarta-backend
```

---

## Project Structure

```
verarta.com/
├── blockchain/                  # Blockchain layer
│   ├── Dockerfile              # Spring build (multi-stage)
│   ├── docker-compose.yml      # Full network
│   ├── genesis.json            # Chain genesis
│   ├── accounts.json           # Producer + user accounts
│   ├── config/                 # Node configurations
│   │   ├── producer1.ini
│   │   ├── producer2.ini
│   │   ├── producer3.ini
│   │   ├── producer4.ini
│   │   └── history.ini
│   ├── contracts/              # Smart contracts
│   │   └── verarta.core/
│   ├── hyperion/               # Hyperion config
│   │   ├── connections.json
│   │   └── config/
│   └── scripts/                # Bootstrap scripts
│       ├── generate-accounts.py
│       └── bootstrap.py
├── backend/                    # Astro SSR backend
│   ├── src/
│   │   ├── pages/api/         # API routes
│   │   ├── lib/               # Utilities
│   │   └── middleware/        # Auth middleware
│   ├── astro.config.mjs
│   └── package.json
├── frontend/                   # React components
│   └── src/
│       ├── components/
│       ├── hooks/
│       └── lib/
├── nginx/                      # Nginx configs
│   └── verarta.com.conf
├── deployment/                 # Deployment scripts
│   └── post-receive
├── PLAN.md                     # Detailed project plan
└── README.md                   # This file
```

---

## Documentation

- **[Project Plan](PLAN.md)** — Comprehensive architecture and implementation guide
- **[Antelope Docs](https://docs.antelope.io/)** — Blockchain protocol documentation
- **[Hyperion Docs](https://hyperion.docs.eosrio.io/)** — History API documentation
- **[Astro Docs](https://docs.astro.build/)** — Backend framework

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/verarta.com/issues)
- **Email**: support@verarta.com
