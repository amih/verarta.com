# Variable Rate Block Production — Test Chain

## Overview

The Verarta test chain implements variable rate block production to optimize resource usage. Instead of producing blocks at a fixed interval regardless of activity, the chain automatically adjusts between three tiers:

| Mode | Block Interval | When |
|------|---------------|------|
| **SLOW** | 60 seconds | No activity for 60s — saves CPU, disk, and network |
| **MEDIUM** | 5 seconds | Normal activity — matches production behavior |
| **FAST** | 500 milliseconds | High load (>5 tx in 5s) — rapid confirmation for bulk operations |

This runs on a **separate chain** with its own genesis, chain ID, and data volumes — completely isolated from the production blockchain.

## Architecture

### Single Active Producer Model

Only **producer1** actively produces blocks. Producers 2-4 are non-producing full nodes that sync blocks via P2P. This avoids the complexity of coordinating pause/resume across multiple machines.

```
                    ┌──────────────────┐
                    │  Pace Controller │
                    │  (pause/resume)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   producer1      │ ← sole block producer
                    │   (active)       │
                    └───┬───┬───┬──────┘
                        │   │   │  P2P sync
              ┌─────────┘   │   └─────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │producer2 │ │producer3 │ │producer4 │
        │(standby) │ │(standby) │ │(standby) │
        └──────────┘ └──────────┘ └──────────┘
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                    ┌──────────────┐
                    │   history    │ → Hyperion indexer → API + Explorer
                    │   (SHiP)    │
                    └──────────────┘
```

### State Machine

```
                         activity burst (>5 tx/5s)
                    ┌──────────────────────────────┐
                    │                              ▼
              ┌──────────┐   activity     ┌──────────┐
  idle 60s ← │  MEDIUM   │ ◄──────────── │   FAST   │ ← cooldown 10s
              │  (5s)     │               │  (500ms) │
              └─────┬─────┘               └──────────┘
                    │ idle 60s
                    ▼
              ┌──────────┐
              │   SLOW   │
              │  (60s)   │
              └──────────┘
                    │ any /activity
                    └───────→ MEDIUM
```

## Port Allocation

Production and test chain use completely separate port ranges:

| Service | Production Port | Test Chain Port |
|---------|----------------|-----------------|
| Producer1 API | 8000 | 18000 |
| Producer2 API | 8001 | 18001 |
| Producer3 API | 8002 | 18002 |
| Producer4 API | 8003 | 18003 |
| Producer1-4 P2P | 9000-9003 | 19000-19003 |
| History API | 8888 | 18888 |
| History P2P | 9004 | 19004 |
| History SHiP | 8080 | 18080 |
| Wallet (keosd) | 6666 | 16666 |
| Hyperion API | 7000 | 17000 |
| Pace Controller | — | 13100 |
| Elasticsearch | 9200 | shared |
| Redis | 6379 | shared (prefix `htest:`) |
| RabbitMQ | 5672 | shared (vhost `hyperion-test`) |
| MongoDB | 27017 | shared (prefix `hyperion-test`) |
| PostgreSQL | 5432 | not used |

## Subdomains

| Subdomain | Proxies to | Purpose |
|-----------|-----------|---------|
| `test-chain.verarta.com` | `127.0.0.1:18888` | Chain API |
| `test-explorer.verarta.com` | `127.0.0.1:17000` | Hyperion built-in block explorer |
| `test-hyperion.verarta.com` | `127.0.0.1:17000` | Hyperion history API |
| `test-pace.verarta.com` | `127.0.0.1:13100` | Pace controller status/activity |

## Pace Controller

The pace controller is a lightweight Node.js service that manages block production by calling the producer API's `pause` and `resume` endpoints on producer1.

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/activity` | Notify of incoming activity. Wakes up interruptible sleep, may escalate pace. |
| `GET` | `/status` | Returns `{ pace, paused, lastActivityAt, headBlockNum, uptime, healthy }` |
| `GET` | `/health` | Returns 200 `ok` or 503 `unhealthy` |

### Transition Logic

**SLOW to MEDIUM**: Any `/activity` notification immediately wakes the controller and escalates to MEDIUM.

**MEDIUM to FAST**: If more than `FAST_THRESHOLD` (default 5) activity notifications arrive within `FAST_WINDOW_MS` (default 5s), the controller escalates to FAST. In FAST mode, the producer runs at its natural 500ms rhythm without pause/resume cycling.

**FAST to MEDIUM**: When activity drops below the threshold for `COOLDOWN_MS` (default 10s), the controller drops back to MEDIUM.

**MEDIUM to SLOW**: When no activity is received for `IDLE_TIMEOUT_MS` (default 60s), the controller drops to SLOW.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PRODUCER_URL` | (required) | Producer1 HTTP endpoint |
| `PORT` | `3100` | HTTP server port |
| `SLOW_INTERVAL_MS` | `60000` | Block interval in slow mode |
| `MEDIUM_INTERVAL_MS` | `5000` | Block interval in medium mode |
| `FAST_THRESHOLD` | `5` | Activity count within window to trigger fast mode |
| `FAST_WINDOW_MS` | `5000` | Rolling window for counting activity |
| `IDLE_TIMEOUT_MS` | `60000` | No activity for this long → slow mode |
| `COOLDOWN_MS` | `10000` | Stay in fast for at least this long after threshold drops |
| `BLOCK_WAIT_TIMEOUT_MS` | `3000` | Max wait for a block after resuming |
| `HEALTH_CHECK_INTERVAL_MS` | `5000` | Producer connectivity check interval |

## Docker Compose

The test chain uses a separate `docker-compose.test.yml` file. It defines its own services, volumes, and network (`verarta-test-net`), plus connects to the production `verarta-net` network so Hyperion containers can reach shared infrastructure (Elasticsearch, Redis, RabbitMQ, MongoDB).

Shared infrastructure is reused with namespace isolation:
- **RabbitMQ**: Separate vhost `hyperion-test` (production uses `hyperion`)
- **Redis**: Key prefix `htest:` (production uses default prefix)
- **MongoDB**: Database prefix `hyperion-test` (production uses `hyperion`)
- **Elasticsearch**: Index prefix `verarta-test` (production uses `verarta`)

## Deployment Guide

### Prerequisites

- Production stack running (shared infrastructure must be available)
- DNS A records for `test-chain`, `test-explorer`, `test-hyperion`, `test-pace` subdomains

### Step 1: Build the Spring 500ms Image

```bash
docker build -t verarta/spring-500ms:latest \
  --build-arg BLOCK_INTERVAL_MS=500 \
  --build-arg PRODUCER_REPETITIONS=6 \
  -f blockchain/Dockerfile blockchain/
```

This takes ~30-60 minutes to compile Spring from source.

### Step 2: Create RabbitMQ Vhost

```bash
docker exec verarta-rabbitmq rabbitmqctl add_vhost hyperion-test
docker exec verarta-rabbitmq rabbitmqctl set_permissions -p hyperion-test rabbitmq ".*" ".*" ".*"
```

### Step 3: Add DNS Records

Add A records pointing to your server IP for:
- `test-chain.verarta.com`
- `test-explorer.verarta.com`
- `test-hyperion.verarta.com`
- `test-pace.verarta.com`

### Step 4: Expand SSL Certificate

```bash
sudo certbot certonly --expand -d verarta.com -d www.verarta.com \
  -d chain.verarta.com -d explorer.verarta.com -d hyperion.verarta.com \
  -d registry.verarta.com \
  -d test-chain.verarta.com -d test-explorer.verarta.com \
  -d test-hyperion.verarta.com -d test-pace.verarta.com
```

### Step 5: Start Producer1 + Wallet

```bash
docker compose -f docker-compose.test.yml up -d test-producer1 test-wallet
```

### Step 6: Record Chain ID

```bash
curl http://localhost:18000/v1/chain/get_info | jq -r .chain_id
```

Update `chain_id` in:
- `blockchain-test/hyperion/connections.json`
- `blockchain-test/hyperion/config/verarta-test.config.json`

### Step 7: Bootstrap the Chain

Create accounts, deploy system contracts, register producers using the bootstrap scripts (same as production but targeting `http://localhost:18000`).

### Step 8: Start Remaining Nodes

```bash
docker compose -f docker-compose.test.yml up -d test-producer2 test-producer3 test-producer4 test-history
```

### Step 9: Start Hyperion

```bash
docker compose -f docker-compose.test.yml up -d test-hyperion-indexer test-hyperion-api
```

### Step 10: Start Pace Controller

```bash
docker compose -f docker-compose.test.yml up -d pace-controller
```

### Step 11: Deploy Nginx Config

```bash
sudo cp nginx/verarta-test.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/verarta-test.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Verification Checklist

```bash
# 1. Chain API — blocks should be incrementing
curl https://test-chain.verarta.com/v1/chain/get_info

# 2. Pace controller — should show pace: "medium" initially
curl https://test-pace.verarta.com/status

# 3. Wait 60s idle → pace drops to "slow", blocks every ~60s
sleep 65 && curl https://test-pace.verarta.com/status

# 4. Send activity → immediate block, pace escalates
curl -X POST https://test-pace.verarta.com/activity
curl https://test-pace.verarta.com/status

# 5. Hyperion health — indexing near head block
curl https://test-hyperion.verarta.com/v2/health

# 6. Browse block explorer
# Visit https://test-explorer.verarta.com in browser

# 7. Production chain unaffected — different chain_id
curl https://chain.verarta.com/v1/chain/get_info
```

## Teardown

To completely remove the test chain without affecting production:

```bash
# Stop and remove all test chain containers + volumes
docker compose -f docker-compose.test.yml down -v

# Remove RabbitMQ vhost
docker exec verarta-rabbitmq rabbitmqctl delete_vhost hyperion-test

# Remove Elasticsearch indices
curl -X DELETE http://localhost:9200/verarta-test-*

# Remove nginx config
sudo rm /etc/nginx/sites-enabled/verarta-test.conf
sudo rm /etc/nginx/sites-available/verarta-test.conf
sudo nginx -t && sudo systemctl reload nginx
```
