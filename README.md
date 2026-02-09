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
│                     Verarta Application                      │
├─────────────────────────────────────────────────────────────┤
│ Frontend (React + WebAuthn) → Astro SSR Backend             │
│                         ↓                                    │
│              PostgreSQL (users) + Redis (cache)             │
│                         ↓                                    │
│   Antelope Blockchain (4 producers + 1 history node)       │
│                         ↓                                    │
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
  - 500 GB SSD
  - 8 CPU cores
- **Domain name** pointed to server IP
- **SSL certificate** (via Let's Encrypt)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Install Nginx
sudo apt install nginx certbot python3-certbot-nginx

# Install Node.js (for backend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2
```

### 2. SSL Certificates

```bash
# Get Let's Encrypt certificates
sudo certbot --nginx -d verarta.com -d www.verarta.com \
  -d explorer.verarta.com -d chain.verarta.com \
  -d hyperion.verarta.com -d registry.verarta.com
```

### 3. Deploy Blockchain

```bash
# Clone repo
git clone https://github.com/yourusername/verarta.com.git /opt/verarta
cd /opt/verarta

# Build and start blockchain
docker compose up -d

# Bootstrap chain
python3 blockchain/scripts/bootstrap.py
```

### 4. Deploy Backend

```bash
# Set up git deployment
cd /opt/verarta
git init --bare repo.git

# Install post-receive hook
cp deployment/post-receive repo.git/hooks/
chmod +x repo.git/hooks/post-receive

# On your dev machine, add production remote
git remote add prod ssh://user@verarta.com/opt/verarta/repo.git

# Deploy
git push prod main
```

The post-receive hook will:
1. Check out code to `/opt/verarta/app`
2. Install dependencies (`npm ci`)
3. Build backend (`npm run build`)
4. Restart via PM2 (`pm2 restart verarta-backend`)

### 5. Configure Nginx

```bash
# Copy Nginx config
sudo cp nginx/verarta.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/verarta.com.conf /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Start Services

```bash
# Start backend with PM2
cd /opt/verarta/app/backend
pm2 start dist/server/entry.mjs --name verarta-backend

# Save PM2 config
pm2 save
pm2 startup
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
