# Verarta Blockchain Application — Project Plan

## Overview

A full-stack blockchain application built on top of the **Antelope/Spring** protocol. The system consists of three layers:

1. **Blockchain Layer** — A private/consortium Antelope chain running 4 block-producing nodes + 1 full-history node with Hyperion, bootstrapped from the Spring `bios-boot-tutorial.py` script
2. **Backend Layer** — An Astro SSR application deployed via `git push prod`
3. **Frontend Layer** — React components served as Astro islands, with WebAuthn-based transaction signing (no wallet extensions)

All services are fronted by **Nginx** on the production server, mapping `verarta.com` subdomains to internal services. Docker images are stored in a **private registry**.

---

## Part 1: Blockchain Layer

### Technology

| Component | Version / Source |
|-----------|-----------------|
| Node software | [AntelopeIO/spring](https://github.com/AntelopeIO/spring) (latest stable, currently v1.2.2) |
| Smart contracts toolchain | [AntelopeIO/cdt](https://github.com/AntelopeIO/cdt) v4.1+ |
| System contracts | [AntelopeIO/reference-contracts](https://github.com/AntelopeIO/reference-contracts) |
| History indexer | [Hyperion History API](https://github.com/eosrio/hyperion-history-api) v3.6+ |
| JS/TS SDK | [@wharfkit/antelope](https://www.npmjs.com/package/@wharfkit/antelope) |
| Transaction signing | `eosjs` + `WebAuthnSignatureProvider` (browser biometrics, no wallet extensions) |
| Bootstrap script | `spring/tutorials/bios-boot-tutorial/bios-boot-tutorial.py` (customized) |
| Block interval | **5 seconds** (custom, default is 0.5s) |
| Docker registry | Private registry at `registry.verarta.com` |

### Source Code Modification — Block Interval & Transaction Limits

Antelope's block interval and size limits are compile-time constants. Modify the Spring source before building:

**File:** `libraries/chain/include/eosio/chain/config.hpp`

#### Block Interval
```cpp
// Default: const static int block_interval_ms = 500;
const static int block_interval_ms = 5000;
```

#### Producer Repetitions
You may also want to adjust `producer_repetitions` (default 12 — the number of consecutive blocks per producer). With a 5s interval and 4 producers:
- 12 repetitions × 5s = **60s per producer round**, 240s full cycle
- To shorten the cycle, reduce to e.g. 6 repetitions: 30s per producer, 120s full cycle

```cpp
// Default: const static int producer_repetitions = 12;
const static int producer_repetitions = 6;
```

#### Transaction Size Limits (Optional)
For large file uploads, you may want to increase the max inline action size:

```cpp
// Default: const static uint32_t default_max_inline_action_size = 512 * 1024; // 512 KB
const static uint32_t default_max_inline_action_size = 2 * 1024 * 1024; // 2 MB

// Also increase max action return value size if needed
// Default: const static uint32_t default_max_action_return_value_size = 256;
const static uint32_t default_max_action_return_value_size = 1024;
```

**Note:** Increasing transaction limits allows larger chunk sizes but may impact block production performance. Only increase if needed for your use case.

### Dockerized Build

The entire chain is built and deployed via Docker. A multi-stage `Dockerfile` clones Spring, patches the block interval, compiles from source, and produces a lean runtime image. Images are pushed to the **private registry**.

**`blockchain/Dockerfile`**
```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────────
FROM ubuntu:22.04 AS builder

ARG SPRING_VERSION=v1.2.2
ARG BLOCK_INTERVAL_MS=5000
ARG PRODUCER_REPETITIONS=6

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential cmake git libcurl4-openssl-dev \
    libgmp-dev llvm-11-dev python3-numpy file zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /spring
RUN git clone --recursive https://github.com/AntelopeIO/spring.git . \
    && git fetch --all --tags \
    && git checkout ${SPRING_VERSION} \
    && git submodule update --init --recursive

# Patch block interval and producer repetitions
RUN sed -i \
    "s/block_interval_ms = 500;/block_interval_ms = ${BLOCK_INTERVAL_MS};/" \
    libraries/chain/include/eosio/chain/config.hpp \
 && sed -i \
    "s/producer_repetitions = 12;/producer_repetitions = ${PRODUCER_REPETITIONS};/" \
    libraries/chain/include/eosio/chain/config.hpp

RUN mkdir -p build && cd build \
    && cmake -DCMAKE_BUILD_TYPE=Release \
             -DCMAKE_PREFIX_PATH=/usr/lib/llvm-11 \
             -DCMAKE_INSTALL_PREFIX=/usr/local .. \
    && make -j "$(nproc)" \
    && make install

# ── Stage 2: Runtime ────────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

RUN apt-get update && apt-get install -y \
    libcurl4 libgmp10 zlib1g python3 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/nodeos   /usr/local/bin/
COPY --from=builder /usr/local/bin/cleos    /usr/local/bin/
COPY --from=builder /usr/local/bin/keosd    /usr/local/bin/

EXPOSE 8888 9876 8080
ENTRYPOINT ["nodeos"]
```

Build and push to private registry:
```bash
cd blockchain
docker build -t registry.verarta.com/verarta/spring:latest \
  --build-arg BLOCK_INTERVAL_MS=5000 \
  --build-arg PRODUCER_REPETITIONS=6 \
  .
docker push registry.verarta.com/verarta/spring:latest
```

### Docker Compose — Full Network

**`docker-compose.yml`** (project root)
```yaml
services:

  # ── Block Producers ────────────────────────────────────────
  producer1:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-producer1
    command: >
      --genesis-json /config/genesis.json
      --config /config/producer1.ini
      --data-dir /data
      --enable-stale-production
      --producer-name producer1
      --plugin eosio::chain_api_plugin
      --plugin eosio::producer_plugin
      --plugin eosio::producer_api_plugin
      --plugin eosio::net_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=producer2:9876
      --p2p-peer-address=producer3:9876
      --p2p-peer-address=producer4:9876
      --p2p-peer-address=history:9876
    ports:
      - "8000:8888"
      - "9000:9876"
    volumes:
      - ./blockchain/config:/config:ro
      - producer1-data:/data
    networks:
      - verarta-net

  producer2:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-producer2
    command: >
      --genesis-json /config/genesis.json
      --config /config/producer2.ini
      --data-dir /data
      --enable-stale-production
      --producer-name producer2
      --plugin eosio::chain_api_plugin
      --plugin eosio::producer_plugin
      --plugin eosio::producer_api_plugin
      --plugin eosio::net_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=producer1:9876
      --p2p-peer-address=producer3:9876
      --p2p-peer-address=producer4:9876
      --p2p-peer-address=history:9876
    ports:
      - "8001:8888"
      - "9001:9876"
    volumes:
      - ./blockchain/config:/config:ro
      - producer2-data:/data
    networks:
      - verarta-net

  producer3:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-producer3
    command: >
      --genesis-json /config/genesis.json
      --config /config/producer3.ini
      --data-dir /data
      --enable-stale-production
      --producer-name producer3
      --plugin eosio::chain_api_plugin
      --plugin eosio::producer_plugin
      --plugin eosio::producer_api_plugin
      --plugin eosio::net_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=producer1:9876
      --p2p-peer-address=producer2:9876
      --p2p-peer-address=producer4:9876
      --p2p-peer-address=history:9876
    ports:
      - "8002:8888"
      - "9002:9876"
    volumes:
      - ./blockchain/config:/config:ro
      - producer3-data:/data
    networks:
      - verarta-net

  producer4:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-producer4
    command: >
      --genesis-json /config/genesis.json
      --config /config/producer4.ini
      --data-dir /data
      --enable-stale-production
      --producer-name producer4
      --plugin eosio::chain_api_plugin
      --plugin eosio::producer_plugin
      --plugin eosio::producer_api_plugin
      --plugin eosio::net_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=producer1:9876
      --p2p-peer-address=producer2:9876
      --p2p-peer-address=producer3:9876
      --p2p-peer-address=history:9876
    ports:
      - "8003:8888"
      - "9003:9876"
    volumes:
      - ./blockchain/config:/config:ro
      - producer4-data:/data
    networks:
      - verarta-net

  # ── Full History Node ──────────────────────────────────────
  history:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-history
    command: >
      --genesis-json /config/genesis.json
      --config /config/history.ini
      --data-dir /data
      --plugin eosio::chain_api_plugin
      --plugin eosio::net_plugin
      --plugin eosio::state_history_plugin
      --plugin eosio::trace_api_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=producer1:9876
      --p2p-peer-address=producer2:9876
      --p2p-peer-address=producer3:9876
      --p2p-peer-address=producer4:9876
      --state-history-endpoint=0.0.0.0:8080
      --trace-history=true
      --chain-state-history=true
      --access-control-allow-origin=*
    ports:
      - "8888:8888"    # Chain API
      - "9004:9876"    # P2P
      - "8080:8080"    # SHiP WebSocket
    volumes:
      - ./blockchain/config:/config:ro
      - history-data:/data
    networks:
      - verarta-net

  # ── Hyperion Infrastructure ────────────────────────────────
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    container_name: verarta-elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    ports:
      - "9200:9200"
    volumes:
      - es-data:/usr/share/elasticsearch/data
    networks:
      - verarta-net

  redis:
    image: redis:8-alpine
    container_name: verarta-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - verarta-net

  rabbitmq:
    image: rabbitmq:4-management
    container_name: verarta-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: rabbitmq
      RABBITMQ_DEFAULT_PASS: rabbitmq
      RABBITMQ_DEFAULT_VHOST: hyperion
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks:
      - verarta-net

  mongodb:
    image: mongo:8
    container_name: verarta-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    networks:
      - verarta-net

  # ── PostgreSQL (User Database) ────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: verarta-postgres
    environment:
      POSTGRES_DB: verarta
      POSTGRES_USER: verarta
      POSTGRES_PASSWORD: verarta
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - verarta-net

  # ── Hyperion Indexer + API ─────────────────────────────────
  hyperion-indexer:
    image: registry.verarta.com/verarta/hyperion:latest
    container_name: verarta-hyperion-indexer
    depends_on:
      - elasticsearch
      - redis
      - rabbitmq
      - mongodb
      - history
    volumes:
      - ./blockchain/hyperion/config:/hyperion-history-api/chains:ro
      - ./blockchain/hyperion/connections.json:/hyperion-history-api/connections.json:ro
    networks:
      - verarta-net
    command: ./run.sh verarta-indexer

  hyperion-api:
    image: registry.verarta.com/verarta/hyperion:latest
    container_name: verarta-hyperion-api
    depends_on:
      - hyperion-indexer
    ports:
      - "7000:7000"
    volumes:
      - ./blockchain/hyperion/config:/hyperion-history-api/chains:ro
      - ./blockchain/hyperion/connections.json:/hyperion-history-api/connections.json:ro
    networks:
      - verarta-net
    command: ./run.sh verarta-api

  # ── Wallet (keosd) — used during bootstrap only ───────────
  wallet:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-wallet
    entrypoint: ["keosd"]
    command: >
      --http-server-address=0.0.0.0:8888
      --unlock-timeout=999999999
      --wallet-dir=/wallet
    ports:
      - "6666:8888"
    volumes:
      - wallet-data:/wallet
    networks:
      - verarta-net

volumes:
  producer1-data:
  producer2-data:
  producer3-data:
  producer4-data:
  history-data:
  es-data:
  redis-data:
  rabbitmq-data:
  mongo-data:
  postgres-data:
  wallet-data:

networks:
  verarta-net:
    driver: bridge
```

Launch the full network:
```bash
# Build the custom Spring image first
docker build -t registry.verarta.com/verarta/spring:latest blockchain/
docker push registry.verarta.com/verarta/spring:latest

# Start all nodes
docker compose up -d

# Run the bootstrap script against the containerized nodes
python3 blockchain/bios-boot-tutorial.py -a \
  --cleos "docker exec verarta-producer1 cleos" \
  --http-port 8000
```

Stop / reset:
```bash
docker compose down              # stop all nodes
docker compose down -v           # stop + wipe all chain data
```

### Hyperion History API

Hyperion indexes all blockchain data from the history node's SHiP WebSocket and exposes rich REST + streaming endpoints.

#### Architecture

```
History Node (nodeos + state_history_plugin)
    |
    | WebSocket (ws://history:8080)
    v
Hyperion Indexer (Node.js + PM2)
    |
    | AMQP
    v
RabbitMQ ──> Elasticsearch (historical: actions, deltas, blocks)
         ──> MongoDB (state: accounts, proposals, voters)
         ──> Redis (caching, tx lookup)
    v
Hyperion API (Fastify HTTP + Socket.IO streaming)
    |
    v
Clients (REST at :7000 / WebSocket streaming)
```

#### Hyperion Configuration

**`blockchain/hyperion/connections.json`**
```json
{
  "amqp": {
    "host": "rabbitmq:5672",
    "api": "rabbitmq:15672",
    "protocol": "http",
    "user": "rabbitmq",
    "pass": "rabbitmq",
    "vhost": "hyperion",
    "frameMax": "0x10000"
  },
  "elasticsearch": {
    "protocol": "http",
    "host": "elasticsearch:9200",
    "ingest_nodes": ["elasticsearch:9200"],
    "user": "",
    "pass": ""
  },
  "redis": { "host": "redis", "port": 6379 },
  "mongodb": {
    "enabled": true,
    "host": "mongodb",
    "port": 27017,
    "database_prefix": "hyperion",
    "user": "",
    "pass": ""
  },
  "chains": {
    "verarta": {
      "name": "Verarta",
      "chain_id": "<chain-id-from-genesis>",
      "http": "http://history:8888",
      "ship": [{ "label": "primary", "url": "ws://history:8080" }],
      "WS_ROUTER_HOST": "0.0.0.0",
      "WS_ROUTER_PORT": 7001,
      "control_port": 7002
    }
  }
}
```

#### Key Hyperion Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v2/history/get_actions` | Query past actions by account, contract, action name |
| `GET /v2/history/get_transaction` | Full transaction with all action traces |
| `GET /v2/history/get_transfers` | Token transfers filtered by from/to/symbol |
| `GET /v2/history/get_deltas` | State deltas for any contract table |
| `GET /v2/history/get_created_accounts` | Accounts created by a creator |
| `GET /v2/state/get_account` | Full account data |
| `GET /v2/state/get_tokens` | All tokens held by an account |
| `GET /v2/state/get_key_accounts` | Accounts by public key |
| `GET /v2/health` | Health check for all dependencies |
| `GET /docs` | Swagger UI |

#### Hyperion Streaming (Socket.IO)

Hyperion also provides a **real-time streaming API** via Socket.IO. The frontend can subscribe to filtered action streams directly from the browser:

```typescript
import { HyperionStreamClient } from "@eosrio/hyperion-stream-client";

const client = new HyperionStreamClient({
  endpoint: "https://hyperion.verarta.com",
});

client.setAsyncDataHandler(async (data) => {
  console.log(data.type, data.content); // "action" or "delta"
});

await client.connect();

// Stream only transfer actions on eosio.token
client.streamActions({
  contract: "eosio.token",
  action: "transfer",
  account: "",
  start_from: 0,   // 0 = live only
  read_until: 0,   // 0 = indefinite
});
```

### Block Explorer

Rather than building a custom block explorer from scratch, we use **Hyperion's rich API** as the data source and build a lightweight explorer UI as part of the frontend. The explorer is available at `explorer.verarta.com`.

#### Explorer Features

| Feature | Data Source |
|---------|------------|
| Chain overview (head block, LIB, producers) | Chain API `/v1/chain/get_info` |
| Browse blocks | Chain API `/v1/chain/get_block` |
| Transaction detail with action traces | Hyperion `/v2/history/get_transaction` |
| Account lookup (balances, resources, permissions) | Hyperion `/v2/state/get_account` + `/v2/state/get_tokens` |
| Action history by account | Hyperion `/v2/history/get_actions` |
| Token transfer history | Hyperion `/v2/history/get_transfers` |
| Contract table browser | Chain API `/v1/chain/get_table_rows` |
| Search (account, tx ID, block number) | Routed to the appropriate endpoint |
| Live feed of new actions | Hyperion Stream Client (Socket.IO) |

### Network Topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          P2P Mesh Network                                │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ Producer │  │ Producer │  │ Producer │  │ Producer │                │
│  │  Node 1  │  │  Node 2  │  │  Node 3  │  │  Node 4  │                │
│  │ (boot)   │  │          │  │          │  │          │                │
│  │ HTTP:8000│  │ HTTP:8001│  │ HTTP:8002│  │ HTTP:8003│                │
│  │ P2P:9000 │  │ P2P:9001 │  │ P2P:9002 │  │ P2P:9003 │                │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                │
│                                                                          │
│  ┌────────────────────────────────┐  ┌─────────────────────────────┐    │
│  │     Full History Node          │  │    Hyperion Stack           │    │
│  │  HTTP:8888 │ P2P:9004          │  │  API:7000 │ Stream:7001    │    │
│  │  SHiP WS:8080                  │──│  Elasticsearch:9200        │    │
│  │  state_history + trace_api     │  │  RabbitMQ:5672             │    │
│  └────────────────────────────────┘  │  Redis:6379 │ Mongo:27017  │    │
│                                       └─────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

| Node | Role | HTTP Port | P2P Port | Extra |
|------|------|-----------|----------|-------|
| Producer 1 (boot) | Block producer | 8000 | 9000 | Genesis node |
| Producer 2 | Block producer | 8001 | 9001 | |
| Producer 3 | Block producer | 8002 | 9002 | |
| Producer 4 | Block producer | 8003 | 9003 | |
| History | Full history (non-producing) | 8888 | 9004 | SHiP:8080 |
| Hyperion API | Indexed history + streaming | 7000 | — | Swagger at /docs |

### Bootstrap Process (based on `bios-boot-tutorial.py`)

The original script bootstraps a chain from genesis to a fully operational decentralized network. We adapt it for our 4-producer + 1-history-node setup:

#### Step-by-step Bootstrap Sequence

1. **Start wallet** (`keosd`)
   - Launch `keosd` on port `6666`
   - Create a default wallet
   - Import the eosio genesis key and all producer keys

2. **Start boot node** (Producer 1 / `nodeos` index 0)
   - Launch with `genesis.json`, enable `chain_api_plugin`, `producer_plugin`, `producer_api_plugin`
   - This node initially produces all blocks as `eosio`

3. **Create system accounts**
   - `eosio.bpay`, `eosio.msig`, `eosio.names`, `eosio.ram`, `eosio.ramfee`, `eosio.saving`, `eosio.stake`, `eosio.token`, `eosio.vpay`, `eosio.rex`, `eosio.fees`, `eosio.reward`, `eosio.wram`, `eosio.reserv`, `eosio.powup`

4. **Deploy core contracts**
   - Deploy `eosio.token` contract to the `eosio.token` account
   - Deploy `eosio.msig` contract to the `eosio.msig` account

5. **Create and issue tokens**
   - Create token: `eosio.token::create` with max supply (e.g., `1,000,000,000.0000 SYS` — symbol TBD)
   - Issue initial allocation to `eosio`

6. **Activate protocol features & deploy system contract**
   - Activate `PREACTIVATE_FEATURE` via producer API
   - Deploy `eosio.boot` (minimal bootstrap contract)
   - Activate all 21 protocol features including `SAVANNA` (BLS-based finality, ~1s)
   - Deploy full `eosio.system` contract replacing `eosio.boot`
   - Initialize system contract: `eosio init '["0", "4,SYS"]'`

7. **Create staked accounts**
   - Create the 4 producer accounts with staked NET/CPU and purchased RAM
   - Create any initial application accounts

8. **Register producers**
   - Each of the 4 producers calls `eosio::regproducer`

9. **Start producer nodes 2–4**
   - Launch 3 additional `nodeos` instances, each configured with its own producer name and key
   - Each connects to all lower-numbered nodes via P2P

10. **Start full history node** (Node 4)
    - Launch a non-producing `nodeos` with `state_history_plugin` + `trace_api_plugin`
    - Connects to all 4 producer nodes via P2P

11. **Start Hyperion stack**
    - Start Elasticsearch, Redis, RabbitMQ, MongoDB
    - Start Hyperion indexer (connects to history node SHiP at `ws://history:8080`)
    - Start Hyperion API (serves on port 7000)
    - Verify at `http://localhost:7000/v2/health`

12. **Vote for producers**
    - Fund voter accounts and cast votes for producers to activate the schedule
    - Once 15% of tokens are staked and voted, the elected schedule takes over from `eosio`

13. **Resign `eosio`**
    - Transfer `eosio` authority to `eosio.prods` (the elected producers)
    - Resign all system accounts — chain is now decentralized

### Custom `accounts.json`

We provide a trimmed `accounts.json` with exactly 4 producers and a small set of initial user accounts:

```json
{
  "users": [
    { "name": "verartacore", "pvt": "...", "pub": "..." },
    { "name": "verartauser1", "pvt": "...", "pub": "..." },
    { "name": "verartauser2", "pvt": "...", "pub": "..." }
  ],
  "producers": [
    { "name": "producer1", "pvt": "...", "pub": "..." },
    { "name": "producer2", "pvt": "...", "pub": "..." },
    { "name": "producer3", "pvt": "...", "pub": "..." },
    { "name": "producer4", "pvt": "...", "pub": "..." }
  ]
}
```

### Full History Node Configuration

```ini
# config.ini for the history node
plugin = eosio::chain_api_plugin
plugin = eosio::net_plugin
plugin = eosio::state_history_plugin
plugin = eosio::trace_api_plugin

# State History (SHiP) — binary WebSocket stream for Hyperion
state-history-endpoint = 0.0.0.0:8080
trace-history = true
chain-state-history = true
state-history-dir = state-history

# Trace API — REST endpoints for block/transaction traces
trace-dir = traces
trace-no-abis = false

# HTTP API
http-server-address = 0.0.0.0:8888
access-control-allow-origin = *

# P2P — connect to all producers
p2p-listen-endpoint = 0.0.0.0:9004
p2p-peer-address = localhost:9000
p2p-peer-address = localhost:9001
p2p-peer-address = localhost:9002
p2p-peer-address = localhost:9003
```

### Smart Contracts (Application-Specific)

Custom smart contracts to be developed with CDT. Placeholder structure:

```
contracts/
├── verarta.token/        # Custom token contract (or extend eosio.token)
│   ├── verarta.token.cpp
│   ├── verarta.token.hpp
│   └── CMakeLists.txt
├── verarta.core/         # Core application logic
│   ├── verarta.core.cpp
│   ├── verarta.core.hpp
│   └── CMakeLists.txt
└── CMakeLists.txt
```

Build contracts:
```bash
cdt-cpp -abigen -o verarta.core.wasm verarta.core.cpp
```

Deploy:
```bash
cleos set contract verartacore ./contracts/verarta.core -p verartacore@active
```

#### Verarta Smart Contract Tables

The `verarta.core` contract contains the following tables:

**`artworks` table** — Stores artwork metadata on-chain. Associated files are uploaded in chunks and tracked separately.

```cpp
struct [[eosio::table]] artwork {
  uint64_t      id;              // auto-increment primary key
  name          owner;           // blockchain account that created this artwork
  std::string   title;           // name/title of the artwork
  uint32_t      created_at;      // Unix timestamp of creation
  uint32_t      file_count;      // Number of files attached to this artwork

  uint64_t primary_key() const { return id; }
  uint64_t by_owner() const { return owner.value; }
};

typedef eosio::multi_index<
  "artworks"_n,
  artwork,
  indexed_by<"byowner"_n, const_mem_fun<artwork, uint64_t, &artwork::by_owner>>
> artworks_table;
```

**`artfiles` table** — Tracks files associated with artworks. Each file may consist of multiple chunks.

```cpp
struct [[eosio::table]] artfile {
  uint64_t      id;              // auto-increment primary key
  uint64_t      artwork_id;      // foreign key to artworks table
  name          owner;           // owner of the artwork
  std::string   filename;        // original filename
  std::string   mime_type;       // e.g., "image/jpeg", "application/pdf"
  uint64_t      file_size;       // total file size in bytes
  std::string   file_hash;       // SHA256 hash of complete file
  uint32_t      chunk_count;     // total number of chunks
  uint32_t      uploaded_chunks; // number of chunks successfully uploaded
  bool          upload_complete; // true when all chunks uploaded
  uint32_t      created_at;      // Unix timestamp
  bool          is_thumbnail;    // true if this is the primary thumbnail

  uint64_t primary_key() const { return id; }
  uint64_t by_artwork() const { return artwork_id; }
  uint64_t by_owner() const { return owner.value; }
};

typedef eosio::multi_index<
  "artfiles"_n,
  artfile,
  indexed_by<"byartwork"_n, const_mem_fun<artfile, uint64_t, &artfile::by_artwork>>,
  indexed_by<"byowner"_n, const_mem_fun<artfile, uint64_t, &artfile::by_owner>>
> artfiles_table;
```

**Actions:**

- `createart(name owner, string title)`
  - Validates `owner` matches transaction authority
  - Inserts new row into `artworks` table with `file_count = 0`
  - Returns artwork ID for subsequent file uploads

- `addfile(name owner, uint64_t artwork_id, string filename, string mime_type, uint64_t file_size, string file_hash, uint32_t chunk_count, bool is_thumbnail)`
  - Validates `owner` owns the artwork
  - Creates new `artfile` record with `uploaded_chunks = 0`, `upload_complete = false`
  - Returns file ID for chunk uploads

- `uploadchunk(name owner, uint64_t file_id, uint32_t chunk_index, vector<uint8_t> chunk_data)`
  - Validates `owner` owns the file
  - Stores chunk data in action (indexed by Hyperion, not in RAM)
  - Increments `uploaded_chunks` counter
  - If `uploaded_chunks == chunk_count`, sets `upload_complete = true` and increments artwork's `file_count`
  - Chunk data is part of action data — Hyperion indexes it

- `deleteart(name owner, uint64_t artwork_id)`
  - Owner can delete their artwork and all associated files
  - Frees RAM from both `artworks` and `artfiles` tables

- `deletefile(name owner, uint64_t file_id)`
  - Owner can delete individual files from an artwork
  - Decrements artwork's `file_count`
  - Frees RAM

**File Storage Strategy (Chunked Uploads):**

1. **Files are split into chunks** (e.g., 1MB per chunk) to fit within transaction size limits
2. **Each chunk is embedded in a separate transaction** via `uploadchunk` action
3. **Hyperion indexes all chunks** and stores them in Elasticsearch
4. **Only metadata is stored in contract RAM** (`artworks` and `artfiles` tables)
5. **Chunks are retrieved and reassembled** by querying Hyperion for all `uploadchunk` actions for a given file

**Chunk Size Calculation:**
- Antelope default `max_inline_action_size`: **512 KB** (from `config.hpp`)
- Transaction overhead (headers, signatures, metadata): ~10-50 KB
- WebAuthn signatures add additional overhead (~200-500 bytes)
- **Recommended chunk size: 256 KB** (leaves ~256KB headroom for transaction overhead)
- Conservative option: **128 KB** (safer for chains with stricter limits or multiple signatures)
- For chains with custom increased limits: can use 512 KB or 1 MB chunks

**Important:** Chunk size must be significantly smaller than the action size limit to account for:
- Transaction serialization overhead
- Multiple authorization signatures (WebAuthn can be large)
- Action name, account name, and other metadata
- Safe margin for chain variations

**Querying artworks and files:**

```bash
# Get all artworks for a user
cleos get table verartacore verartacore artworks --index 2 --key-type name --lower alice --upper alice

# Get all files for an artwork
cleos get table verartacore verartacore artfiles --index 2 --key-type i64 --lower 123 --upper 123

# Get all chunks for a file from Hyperion
curl "https://hyperion.verarta.com/v2/history/get_actions?account=alice&filter=verartacore:uploadchunk&limit=1000"
```

### Joining the Network from a Remote Server

Any new server can join the Verarta blockchain with a single Docker command and two small files. We publish a **join-node kit** — a minimal package that contains everything needed.

#### What ships in the join-node kit

```
verarta-join-node/
├── genesis.json             # Must match the chain's genesis exactly
├── .env                     # Only file the operator edits
└── docker-compose.yml       # Single-service compose file
```

The `verarta/spring:latest` image is pulled from the private registry at `registry.verarta.com`. Remote operators need registry access (credentials provided separately).

#### `.env` — the only thing the operator fills in

```env
# Required: at least one existing peer (public IP/DNS of any running node)
PEER_1=seed1.verarta.com:9876
PEER_2=seed2.verarta.com:9876

# Optional overrides
NODE_HTTP_PORT=8888
NODE_P2P_PORT=9876
NODE_MODE=api            # "api" (default) or "history"
```

#### `docker-compose.yml` (join-node)

```yaml
services:
  node:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-node
    restart: unless-stopped
    command: >
      --genesis-json /config/genesis.json
      --data-dir /data
      --plugin eosio::chain_api_plugin
      --plugin eosio::net_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=${PEER_1}
      --p2p-peer-address=${PEER_2:-}
      --access-control-allow-origin=*
      --chain-state-db-size-mb=4096
    ports:
      - "${NODE_HTTP_PORT:-8888}:8888"
      - "${NODE_P2P_PORT:-9876}:9876"
    volumes:
      - ./genesis.json:/config/genesis.json:ro
      - node-data:/data

volumes:
  node-data:
```

#### Joining — 3 commands

On any server with Docker installed:

```bash
# 1. Login to private registry and get the join-node kit
docker login registry.verarta.com
tar xzf verarta-join-node.tar.gz && cd verarta-join-node

# 2. Set at least one peer address
echo 'PEER_1=seed1.verarta.com:9876' > .env

# 3. Start
docker compose up -d
```

The node will connect to the peer(s), sync from genesis, and begin serving the Chain API once caught up. No keys, no wallet, no bootstrap script — just `genesis.json` and a peer address.

#### Joining as a history node

Set `NODE_MODE=history` in `.env`. The compose file includes a profile that adds the history plugins:

```yaml
# Append to the join-node docker-compose.yml
services:
  history-node:
    image: registry.verarta.com/verarta/spring:latest
    container_name: verarta-history-node
    profiles: ["history"]
    restart: unless-stopped
    command: >
      --genesis-json /config/genesis.json
      --data-dir /data
      --plugin eosio::chain_api_plugin
      --plugin eosio::net_plugin
      --plugin eosio::state_history_plugin
      --plugin eosio::trace_api_plugin
      --http-server-address=0.0.0.0:8888
      --p2p-listen-endpoint=0.0.0.0:9876
      --p2p-peer-address=${PEER_1}
      --p2p-peer-address=${PEER_2:-}
      --state-history-endpoint=0.0.0.0:8080
      --trace-history=true
      --chain-state-history=true
      --access-control-allow-origin=*
      --chain-state-db-size-mb=8192
    ports:
      - "${NODE_HTTP_PORT:-8888}:8888"
      - "${NODE_P2P_PORT:-9876}:9876"
      - "8080:8080"
    volumes:
      - ./genesis.json:/config/genesis.json:ro
      - history-data:/data

volumes:
  history-data:
```

```bash
docker compose --profile history up -d
```

#### Seed nodes

The core infrastructure should expose at least 2 stable, publicly reachable seed endpoints for new nodes to bootstrap from. These are simply the P2P ports of the existing producer or history nodes behind a DNS name:

| DNS | Maps to |
|-----|---------|
| `seed1.verarta.com:9876` | Producer 1 P2P |
| `seed2.verarta.com:9876` | History node P2P |

---

## Part 2: Backend Layer

### Technology

**Astro** with the `@astrojs/node` adapter, deployed via bare-metal git hooks.

| Component | Choice |
|-----------|--------|
| Framework | Astro 5.x (SSR mode with Node adapter) |
| Blockchain SDK (server) | `@wharfkit/antelope` (API client, types, serialization) |
| Real-time streaming | SSE from Astro API routes (recommended) + Hyperion Stream Client in browser |
| Deployment | `git push prod` via bare-metal git hook on the server |

### WebSocket / Real-Time Comparison

| Approach | Latency | Complexity | Astro Fit | Filtering | Browser-Direct |
|----------|---------|------------|-----------|-----------|----------------|
| **SHiP (native WS)** | ~0-500ms | High (binary protocol, deserialize) | Indirect only (needs sidecar) | None (firehose) | No |
| **Hyperion Stream** | ~1-3s | Low (if Hyperion deployed) | Good (browser client) | Server-side (contract, action, fields) | Yes |
| **Custom WS (`ws`)** | ~0.5-2s | Medium (polling + diff + broadcast) | Needs separate process | You implement | Yes |
| **SSE (Astro native)** | ~0.5-2s | Low (~30 LOC server, ~5 LOC client) | Excellent (native API route) | You implement | Yes (EventSource) |
| **Socket.IO** | ~0.5-3s | Medium (rooms, reconnection) | Needs separate process | You implement (rooms) | Yes |

**Decision:** Use a **two-tier approach**:
1. **Hyperion Stream Client** in the browser for live action/delta streams (already available since we deploy Hyperion). Zero backend code needed — the React component connects directly.
2. **SSE from Astro API routes** for simpler polling-based updates (chain info, balances) that don't need Hyperion's full indexing. Native to Astro, no extra dependencies.

### Deployment — `git push prod`

Set up a bare Git repository on the production server with a `post-receive` hook that builds and restarts the Astro app.

**On the server:**
```bash
# Create bare repo
mkdir -p /opt/verarta/repo.git && cd /opt/verarta/repo.git
git init --bare

# Create post-receive hook
cat > hooks/post-receive << 'HOOK'
#!/bin/bash
set -e
TARGET="/opt/verarta/app"
GIT_DIR="/opt/verarta/repo.git"

echo ">> Deploying to $TARGET..."
git --work-tree=$TARGET --git-dir=$GIT_DIR checkout -f

cd $TARGET/backend
npm ci --production=false
npm run build

# Restart via PM2 or systemd
pm2 restart verarta-backend || pm2 start dist/server/entry.mjs --name verarta-backend
echo ">> Deploy complete."
HOOK
chmod +x hooks/post-receive
```

**On the developer machine:**
```bash
cd verarta.com
git remote add prod ssh://deploy@verarta.com/opt/verarta/repo.git
git push prod main
```

Every `git push prod main` triggers: checkout -> `npm ci` -> `npm run build` -> PM2 restart.

### Architecture

```
backend/
├── src/
│   ├── pages/
│   │   ├── api/
│   │   │   ├── chain/
│   │   │   │   ├── info.ts              # GET  — chain info
│   │   │   │   ├── block/[id].ts        # GET  — block details
│   │   │   │   └── transaction.ts       # POST — push signed transaction
│   │   │   ├── accounts/
│   │   │   │   ├── [name].ts            # GET  — account details
│   │   │   │   ├── create.ts            # POST — create account (server-side)
│   │   │   │   ├── verify-email.ts      # POST — email verification for account creation
│   │   │   │   └── register.ts          # POST — new user registration (email + name)
│   │   │   ├── tokens/
│   │   │   │   ├── balance.ts           # GET  — token balance
│   │   │   │   └── transfer.ts          # POST — (client signs, server relays)
│   │   │   ├── contracts/
│   │   │   │   ├── tables.ts            # GET  — query contract table rows
│   │   │   │   └── action.ts            # POST — push contract action
│   │   │   ├── history/
│   │   │   │   ├── actions.ts           # GET  — proxied to Hyperion /v2/history/get_actions
│   │   │   │   └── transaction/[id].ts  # GET  — proxied to Hyperion /v2/history/get_transaction
│   │   │   ├── artworks/
│   │   │   │   ├── create.ts            # POST — create artwork record (metadata only)
│   │   │   │   ├── list.ts              # GET  — list user's artworks with thumbnails
│   │   │   │   ├── [id].ts              # GET  — get artwork details
│   │   │   │   ├── delete.ts            # POST — delete artwork
│   │   │   │   ├── upload-start.ts      # POST — initiate file upload, save temp file, return upload ID
│   │   │   │   ├── upload-chunk.ts      # POST — upload single chunk to blockchain
│   │   │   │   ├── upload-complete.ts   # POST — finalize upload, delete temp file
│   │   │   │   ├── files/[id].ts        # GET  — get file metadata + download assembled chunks
│   │   │   │   └── files/delete.ts      # POST — delete file from artwork
│   │   │   ├── auth/
│   │   │   │   ├── login.ts             # POST — authenticate user session
│   │   │   │   ├── logout.ts            # POST — clear session
│   │   │   │   └── session.ts           # GET  — get current session info
│   │   │   └── stream/
│   │   │       └── chain-info.ts        # GET  — SSE endpoint for live chain info
│   │   ├── explorer/
│   │   │   └── [...slug].astro          # Block explorer pages (SSR)
│   │   └── [...slug].astro              # Catch-all SSR (serves React app)
│   ├── lib/
│   │   ├── antelope.ts                  # @wharfkit/antelope client setup
│   │   ├── hyperion.ts                  # Hyperion API client helpers
│   │   └── config.ts                    # Chain endpoints, contract names
│   ├── middleware/
│   │   └── auth.ts                      # API authentication middleware
│   └── env.d.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

### Blockchain Integration

```typescript
// src/lib/antelope.ts — server-side only
import { APIClient } from '@wharfkit/antelope'

// Read operations via history node
export const chainClient = new APIClient({
  url: import.meta.env.HISTORY_NODE_URL || 'http://localhost:8888',
})

// Write operations via producer node
export const producerClient = new APIClient({
  url: import.meta.env.PRODUCER_NODE_URL || 'http://localhost:8000',
})
```

```typescript
// src/lib/hyperion.ts — server-side proxy to Hyperion
const HYPERION_URL = import.meta.env.HYPERION_URL || 'http://localhost:7000'

export async function getActions(account: string, limit = 20) {
  const res = await fetch(`${HYPERION_URL}/v2/history/get_actions?account=${account}&limit=${limit}`)
  return res.json()
}

export async function getTransaction(id: string) {
  const res = await fetch(`${HYPERION_URL}/v2/history/get_transaction?id=${id}`)
  return res.json()
}
```

### SSE Endpoint Example

```typescript
// src/pages/api/stream/chain-info.ts
import type { APIRoute } from "astro"
import { chainClient } from "../../../lib/antelope"

export const GET: APIRoute = async ({ request }) => {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const interval = setInterval(async () => {
        try {
          const info = await chainClient.v1.chain.get_info()
          send({ head_block_num: info.head_block_num, lib: info.last_irreversible_block_num })
        } catch {}
      }, 5000) // match block interval

      request.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

### User Registration & Authentication

**Two-tier user system:**
1. **Regular users** — Register with email + name, can create/manage artworks, no admin access
2. **Admin users** — Pre-configured blockchain accounts with admin permissions (managed via WebAuthn)

#### Regular User Registration Flow

1. **Sign-up** (`POST /api/accounts/register`)
   - User provides: name (display name), email
   - Backend generates a unique blockchain account name (e.g., `user12345678`)
   - Backend sends 6-digit verification code to email via SMTP/SendGrid/etc.
   - Stores pending registration in Redis/database with 15-minute expiry:
     ```json
     {
       "email": "user@example.com",
       "display_name": "Alice Smith",
       "account_name": "user12345678",
       "verification_code": "123456",
       "webauthn_pubkey": null,
       "expires_at": 1234567890
     }
     ```

2. **Email verification** (`POST /api/accounts/verify-email`)
   - User submits email + verification code
   - Backend validates code, generates WebAuthn credential challenge
   - Frontend calls `navigator.credentials.create()` with biometric authenticator
   - User completes biometric enrollment (fingerprint/Face ID)
   - Frontend sends WebAuthn public key back to backend

3. **Account creation** (`POST /api/accounts/create`)
   - Backend creates blockchain account using system account authority
   - Sets account's `active` permission to user's WebAuthn public key
   - Stores user metadata in PostgreSQL/MongoDB:
     ```sql
     CREATE TABLE users (
       id SERIAL PRIMARY KEY,
       blockchain_account VARCHAR(12) UNIQUE NOT NULL,
       email VARCHAR(255) UNIQUE NOT NULL,
       display_name VARCHAR(100) NOT NULL,
       is_admin BOOLEAN DEFAULT FALSE,
       created_at TIMESTAMP DEFAULT NOW(),
       last_login TIMESTAMP
     );
     ```
   - Returns session token (JWT) + blockchain account name
   - User can now sign transactions via WebAuthn

4. **Session management**
   - JWT stored in httpOnly cookie
   - Session contains: `{ user_id, blockchain_account, email, is_admin }`
   - Middleware validates JWT on protected routes
   - Non-admin users blocked from accessing `/api/admin/*` endpoints

#### Database Schema (PostgreSQL)

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  blockchain_account VARCHAR(12) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  webauthn_pubkey TEXT,                    -- Base64-encoded public key
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  email_verified BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_blockchain_account ON users(blockchain_account);

-- Email verification codes (or use Redis)
CREATE TABLE email_verifications (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  verification_code VARCHAR(6) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  blockchain_account VARCHAR(12) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_email ON email_verifications(email);
CREATE INDEX idx_email_verifications_code ON email_verifications(verification_code);

-- Sessions (or use Redis/JWT-only)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Artwork uploads (temporary tracking)
CREATE TABLE artwork_uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  artwork_id BIGINT,                       -- blockchain artwork ID (null until created)
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_artwork_uploads_user_id ON artwork_uploads(user_id);

-- File uploads (temporary tracking until all chunks uploaded)
CREATE TABLE file_uploads (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER REFERENCES artwork_uploads(id) ON DELETE CASCADE,
  file_id BIGINT,                          -- blockchain file ID (null until addfile action)
  temp_path VARCHAR(500) NOT NULL,         -- path to temp file on server
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  file_hash VARCHAR(64) NOT NULL,          -- SHA256
  chunk_size INTEGER NOT NULL,             -- bytes per chunk
  total_chunks INTEGER NOT NULL,
  uploaded_chunks INTEGER DEFAULT 0,
  upload_complete BOOLEAN DEFAULT FALSE,
  is_thumbnail BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_file_uploads_upload_id ON file_uploads(upload_id);
CREATE INDEX idx_file_uploads_file_id ON file_uploads(file_id);

-- Chunk upload tracking
CREATE TABLE chunk_uploads (
  id SERIAL PRIMARY KEY,
  file_upload_id INTEGER REFERENCES file_uploads(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  tx_id VARCHAR(64),                       -- blockchain transaction ID
  uploaded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(file_upload_id, chunk_index)
);

CREATE INDEX idx_chunk_uploads_file_upload_id ON chunk_uploads(file_upload_id);
```

**Note:** Alternatively, store verification codes and sessions in Redis for faster access and automatic expiration handling. PostgreSQL is used for persistent user records.

**Temp file cleanup:** A cron job or scheduled task should periodically delete temp files older than 24 hours where `upload_complete = false` (abandoned uploads).

```typescript
// src/lib/cleanup.ts
import fs from 'fs/promises'
import path from 'path'

export async function cleanupAbandonedUploads() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago

  // Find abandoned uploads
  const abandoned = await db.file_uploads.findAll({
    where: {
      upload_complete: false,
      created_at: { $lt: cutoff }
    }
  })

  for (const upload of abandoned) {
    try {
      // Delete temp file
      await fs.unlink(upload.temp_path)
      await fs.rmdir(path.dirname(upload.temp_path))

      // Delete database record
      await db.file_uploads.delete(upload.id)

      console.log(`Cleaned up abandoned upload: ${upload.id}`)
    } catch (err) {
      console.error(`Failed to cleanup ${upload.id}:`, err)
    }
  }
}

// Run every hour
setInterval(cleanupAbandonedUploads, 60 * 60 * 1000)
```

#### Email Verification Implementation

```typescript
// src/lib/email.ts
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: import.meta.env.SMTP_HOST,
  port: 587,
  auth: {
    user: import.meta.env.SMTP_USER,
    pass: import.meta.env.SMTP_PASS,
  },
})

export async function sendVerificationEmail(email: string, code: string, displayName: string) {
  await transporter.sendMail({
    from: 'Verarta <noreply@verarta.com>',
    to: email,
    subject: 'Verify your Verarta account',
    html: `
      <h2>Welcome to Verarta, ${displayName}!</h2>
      <p>Your verification code is: <strong>${code}</strong></p>
      <p>This code expires in 15 minutes.</p>
    `,
  })
}
```

```typescript
// src/pages/api/accounts/register.ts
import type { APIRoute } from 'astro'
import { sendVerificationEmail } from '../../../lib/email'
import redis from '../../../lib/redis'

export const POST: APIRoute = async ({ request }) => {
  const { email, display_name } = await request.json()

  // Validate inputs
  if (!email || !display_name) {
    return new Response(JSON.stringify({ error: 'Email and name required' }), { status: 400 })
  }

  // Check if email already registered
  const existing = await db.users.findOne({ email })
  if (existing) {
    return new Response(JSON.stringify({ error: 'Email already registered' }), { status: 409 })
  }

  // Generate unique blockchain account name (12 chars, a-z, 1-5)
  const accountName = generateAccountName() // e.g., "user12345678"

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString()

  // Store pending registration in Redis (15 min expiry)
  await redis.setex(
    `pending:${email}`,
    900,
    JSON.stringify({ email, display_name, account_name: accountName, code })
  )

  // Send email
  await sendVerificationEmail(email, code, display_name)

  return new Response(JSON.stringify({
    message: 'Verification code sent to email',
    account_name: accountName
  }), { status: 200 })
}
```

### Environment Configuration

```env
# .env
CHAIN_ID=<chain-id-from-genesis>
HISTORY_NODE_URL=http://localhost:8888
PRODUCER_NODE_URL=http://localhost:8000
HYPERION_URL=http://localhost:7000
SHIP_WS_URL=ws://localhost:8080
TOKEN_SYMBOL=SYS
TOKEN_PRECISION=4

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@verarta.com
SMTP_PASS=<app-password>

# Session
JWT_SECRET=<random-secret>
JWT_EXPIRY=7d

# Database
DATABASE_URL=postgresql://verarta:password@localhost:5432/verarta
REDIS_URL=redis://localhost:6379

# File Uploads
TEMP_UPLOAD_DIR=/tmp/verarta-uploads
CHUNK_SIZE=262144                  # 256 KB in bytes (safe for 512KB action limit)
MAX_FILE_SIZE=104857600            # 100 MB max per file
CLEANUP_INTERVAL_HOURS=1           # Run cleanup every hour
ABANDONED_UPLOAD_HOURS=24          # Delete uploads older than 24h

# Blockchain Configuration Reference
# Default max_inline_action_size: 524288 bytes (512 KB)
# Chunk size should be ~50% of action limit to account for overhead
```

---

## Part 3: Frontend Layer

### Technology

| Library | Purpose |
|---------|---------|
| React 19 | UI framework (rendered as Astro islands) |
| TanStack Query | Data fetching, caching, real-time updates |
| eosjs | Blockchain SDK (transaction building, ABI serialization) |
| eosjs `WebAuthnSignatureProvider` | Biometric transaction signing (no wallet extensions) |
| @eosrio/hyperion-stream-client | Real-time action/delta streaming from Hyperion |
| Tailwind CSS | Styling |

### Authentication — WebAuthn Only (No Wallet Extensions)

Based on the pattern from [securarts](https://github.com/amih/securarts/blob/master/src/pages/Dashboard/NftDetails.tsx), we use **WebAuthn (FIDO2) biometric signing** as the sole authentication method. No Anchor, no Scatter, no wallet extensions.

#### How It Works

1. **Account creation** (server-assisted):
   - User provides email, server sends verification code
   - Browser calls `navigator.credentials.create()` with `authenticatorAttachment: "platform"` (fingerprint/Face ID)
   - Public key is extracted from the attestation object, converted to EOS WebAuthn format
   - Server creates the blockchain account with the WebAuthn public key as the `active` permission
   - Credential ID + public key are stored in `localStorage`

2. **Transaction signing** (client-side, no server):
   ```typescript
   import { Api, JsonRpc } from 'eosjs'
   import { WebAuthnSignatureProvider } from 'eosjs/dist/eosjs-webauthn-sig'

   const signatureProvider = new WebAuthnSignatureProvider()
   signatureProvider.keys.clear()
   const pubkeyData = JSON.parse(localStorage.pubkeyData)
   signatureProvider.keys.set(pubkeyData.pubkey, pubkeyData.hex)

   const rpc = new JsonRpc('https://chain.verarta.com')
   const api = new Api({ rpc, signatureProvider })

   const result = await api.transact({
     actions: [{
       account: 'verartacore',
       name: 'myaction',
       authorization: [{ actor: localStorage.verartaAccount, permission: 'active' }],
       data: { /* action data */ },
     }]
   }, { blocksBehind: 60, expireSeconds: 120 })
   ```

3. **User prompt**: The browser's native biometric dialog (fingerprint/Face ID) appears for every transaction. No wallet popup, no extension, no mobile app.

4. **Session state**: All client-side, in `localStorage`:
   - `localStorage.verartaAccount` — blockchain account name
   - `localStorage.pubkeyData` — `{ pubkey, hex }` for signing
   - `localStorage.emailOfUser` — user email

#### Why WebAuthn over Wallet Extensions

- Zero installs — works on any modern browser with biometric hardware
- Mobile-first — native support on iOS (Face ID / Touch ID) and Android (fingerprint)
- No private keys exposed — keys never leave the device's secure enclave
- Simpler UX — no wallet setup, no seed phrases, no browser extensions

### Application Structure

```
frontend/                              # React components as Astro islands
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── chain/
│   │   │   ├── BlockInfo.tsx          # Current block / chain info (SSE)
│   │   │   ├── TransactionView.tsx    # Transaction detail view
│   │   │   ├── ProducerList.tsx       # Active producers & schedule
│   │   │   └── LiveFeed.tsx           # Real-time actions (Hyperion Stream)
│   │   ├── explorer/
│   │   │   ├── BlockList.tsx          # Browse blocks
│   │   │   ├── BlockDetail.tsx        # Single block detail
│   │   │   ├── TxDetail.tsx           # Transaction with action traces
│   │   │   ├── AccountView.tsx        # Account lookup
│   │   │   └── SearchBar.tsx          # Universal search
│   │   ├── auth/
│   │   │   ├── RegisterForm.tsx       # User registration (email + name)
│   │   │   ├── VerifyEmail.tsx        # Email verification code input
│   │   │   ├── CreateAccount.tsx      # WebAuthn account creation wizard
│   │   │   ├── SignTransaction.tsx    # Biometric signing component
│   │   │   ├── LoginForm.tsx          # User login
│   │   │   └── AccountInfo.tsx        # Current account details
│   │   ├── artworks/
│   │   │   ├── ArtworkList.tsx        # User's artworks with thumbnails
│   │   │   ├── ArtworkCard.tsx        # Single artwork card (thumbnail + title)
│   │   │   ├── CreateArtwork.tsx      # Form to create new artwork + upload file
│   │   │   ├── ArtworkDetail.tsx      # Full artwork view with file viewer
│   │   │   └── FileUpload.tsx         # File upload component with preview
│   │   ├── tokens/
│   │   │   ├── TokenBalance.tsx       # Token balances
│   │   │   └── TransferForm.tsx       # Send tokens form
│   │   ├── contracts/
│   │   │   ├── ContractExplorer.tsx   # Browse contract tables
│   │   │   └── ActionForm.tsx         # Execute contract actions
│   │   └── common/
│   │       ├── DataTable.tsx
│   │       └── Notification.tsx
│   ├── hooks/
│   │   ├── useChainInfo.ts            # SSE-based chain info
│   │   ├── useAccount.ts              # Fetch account data
│   │   ├── useTableRows.ts            # Query contract tables
│   │   ├── useWebAuthn.ts             # WebAuthn session state
│   │   ├── useTransact.ts             # Push transactions via WebAuthn
│   │   ├── useHyperionStream.ts       # Hyperion streaming hook
│   │   ├── useAuth.ts                 # User registration, login, session
│   │   ├── useArtworks.ts             # Fetch user's artworks
│   │   └── useCreateArtwork.ts        # Create artwork mutation with file upload
│   ├── lib/
│   │   ├── api.ts                     # Backend API client
│   │   ├── webauthn.ts                # WebAuthn key creation + eosjs setup
│   │   ├── hyperion-stream.ts         # HyperionStreamClient setup
│   │   └── config.ts                  # API base URL, chain config
│   └── index.css
├── package.json
└── tsconfig.json
```

### Key Frontend Features

1. **User Registration & Authentication**
   - Email-based registration with verification codes
   - WebAuthn biometric enrollment (fingerprint/Face ID)
   - Session-based authentication with JWT
   - Role-based access control (regular users vs admins)

2. **Artwork Management** (Regular Users)
   - Create artwork records with metadata (title, creation date)
   - Upload images/documents (stored in blockchain history via action data)
   - View personal artwork gallery with thumbnails
   - Each artwork card shows: thumbnail of first image, title, creation date
   - Click artwork to view full details + download files
   - Delete artworks (removes table row, frees RAM)

3. **Dashboard** — Chain info (head block, LIB, chain ID), recent blocks, producer schedule, live action feed

4. **Block Explorer** (at `explorer.verarta.com`) — Browse blocks, transactions, accounts, action history

5. **WebAuthn Transaction Signing** — All blockchain actions signed via biometrics, no wallet extensions

6. **Token Management** — View balances, transfer tokens

7. **Contract Interaction** (Admin Only) — Browse contract tables, execute arbitrary actions via forms

8. **Account Management** — View account details, resource usage (RAM/CPU/NET)

### Artwork File Storage & Retrieval

**Problem:** On-chain RAM is expensive. Transaction size limits prevent large files from being uploaded in a single transaction.

**Solution:** Store files in **blockchain history** (indexed by Hyperion) using **chunked uploads**. Files are temporarily stored on the server, split into chunks, uploaded to blockchain in multiple transactions, then deleted.

#### Chunked Upload Flow

**Phase 1: Create Artwork**
```
User creates artwork (title only)
  → POST /api/artworks/create { title: "My Artwork" }
  → Backend signs `createart` action
  → Blockchain creates artwork record with artwork_id
  → Returns artwork_id to frontend
```

**Phase 2: Upload Files (can be multiple, can be done later)**
```
User selects file(s) (browser)
  → For each file:
    1. Frontend sends file to backend
       POST /api/artworks/upload-start
       { artwork_id, file: FormData }

    2. Backend saves temp file to disk
       /tmp/uploads/{upload_id}/{original_filename}
       Calculates: file_size, file_hash (SHA256), chunk_count
       Creates database record in file_uploads table
       Returns: { upload_id, file_id, chunk_count, chunk_size }

    3. Frontend requests chunk upload in sequence
       For chunk_index = 0 to chunk_count - 1:
         POST /api/artworks/upload-chunk
         { upload_id, chunk_index }

         Backend:
           - Reads chunk from temp file (offset = chunk_index * chunk_size)
           - Signs `uploadchunk` action with chunk data
           - Pushes transaction to blockchain
           - Records tx_id in chunk_uploads table
           - Returns: { tx_id, uploaded_chunks, total_chunks }

    4. Frontend confirms upload complete
       POST /api/artworks/upload-complete { upload_id }

       Backend:
         - Verifies all chunks uploaded
         - Deletes temp file from disk
         - Updates file_uploads.upload_complete = true
         - Returns: { file_id, file_hash, chunk_count }
```

**Phase 3: View Artwork & Files**
```
User opens artwork detail page
  → GET /api/artworks/{artwork_id}
    Backend:
      - Fetches artwork metadata from blockchain table
      - Fetches file list from artfiles table
      - Returns: { title, created_at, files: [{ id, filename, mime_type, file_size, is_thumbnail }] }

  → User clicks file to download/view
    GET /api/artworks/files/{file_id}
    Backend:
      - Queries Hyperion for all uploadchunk actions for this file_id
      - Assembles chunks in order (chunk_index 0, 1, 2, ...)
      - Verifies SHA256 hash matches file_hash
      - Streams assembled file to frontend
      - Frontend displays image or initiates download
```

#### Contract RAM Usage

- **Per artwork:** ~100 bytes (id, owner, title, created_at, file_count)
- **Per file:** ~250 bytes (id, artwork_id, filename, mime_type, file_size, file_hash, chunk_count, etc.)
- **Per chunk:** 0 bytes in RAM (chunk data is in action data, indexed by Hyperion)

**Example:** An artwork with 3 files (2MB, 5MB, 10MB) using 1MB chunks:
- Artwork record: 100 bytes
- File records: 3 × 250 = 750 bytes
- Chunks: 17 total chunks × 0 bytes = 0 bytes
- **Total RAM: 850 bytes** (vs 17MB if files were stored in RAM)

#### Thumbnail Handling

Option 1: **First file is thumbnail**
- Mark first uploaded file with `is_thumbnail = true`
- Backend generates 200×200 thumbnail, uploads as separate file

Option 2: **Separate thumbnail upload**
- User uploads full-size image + thumbnail separately
- Thumbnail is a small file (e.g., 50KB) uploaded in 1 chunk

#### Example: Chunked Upload Implementation

```typescript
// Frontend: src/components/artworks/CreateArtwork.tsx
import { useState } from 'react'
import { useCreateArtwork } from '../../hooks/useCreateArtwork'

function CreateArtwork() {
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({})

  const handleSubmit = async (title: string, files: FileList) => {
    // Step 1: Create artwork (metadata only)
    const artwork = await fetch('/api/artworks/create', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }).then(r => r.json())

    const artworkId = artwork.id

    // Step 2: Upload each file
    for (const file of files) {
      // Step 2a: Start upload (save temp file on server)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('artwork_id', artworkId)
      formData.append('is_thumbnail', files[0] === file ? 'true' : 'false')

      const uploadStart = await fetch('/api/artworks/upload-start', {
        method: 'POST',
        body: formData,
      }).then(r => r.json())

      const { upload_id, chunk_count, chunk_size } = uploadStart

      // Step 2b: Upload chunks sequentially
      for (let i = 0; i < chunk_count; i++) {
        const result = await fetch('/api/artworks/upload-chunk', {
          method: 'POST',
          body: JSON.stringify({ upload_id, chunk_index: i }),
        }).then(r => r.json())

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: ((i + 1) / chunk_count) * 100
        }))
      }

      // Step 2c: Complete upload (delete temp file)
      await fetch('/api/artworks/upload-complete', {
        method: 'POST',
        body: JSON.stringify({ upload_id }),
      })
    }
  }

  return (
    <div>
      {/* Upload form with progress bars */}
    </div>
  )
}
```

```typescript
// Backend: src/pages/api/artworks/upload-start.ts
import type { APIRoute } from 'astro'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const CHUNK_SIZE = parseInt(import.meta.env.CHUNK_SIZE) || 256 * 1024 // 256 KB default
const TEMP_DIR = '/tmp/verarta-uploads'

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await validateSession(cookies.get('session'))
  if (!session) return new Response('Unauthorized', { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const artworkId = formData.get('artwork_id')
  const isThumbnail = formData.get('is_thumbnail') === 'true'

  // Generate upload ID
  const uploadId = crypto.randomUUID()
  const uploadDir = path.join(TEMP_DIR, uploadId)
  await fs.mkdir(uploadDir, { recursive: true })

  // Save file to temp location
  const tempPath = path.join(uploadDir, file.name)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(tempPath, buffer)

  // Calculate file hash
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  // Calculate chunks
  const fileSize = buffer.length
  const chunkCount = Math.ceil(fileSize / CHUNK_SIZE)

  // Create database record
  const fileUpload = await db.file_uploads.create({
    upload_id: uploadId,
    artwork_id: artworkId,
    temp_path: tempPath,
    original_filename: file.name,
    mime_type: file.type,
    file_size: fileSize,
    file_hash: hash,
    chunk_size: CHUNK_SIZE,
    total_chunks: chunkCount,
    is_thumbnail: isThumbnail,
  })

  return new Response(JSON.stringify({
    upload_id: uploadId,
    chunk_count: chunkCount,
    chunk_size: CHUNK_SIZE,
    file_hash: hash,
  }), { status: 200 })
}
```

```typescript
// Backend: src/pages/api/artworks/upload-chunk.ts
import type { APIRoute } from 'astro'
import fs from 'fs/promises'
import { Api } from 'eosjs'

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await validateSession(cookies.get('session'))
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { upload_id, chunk_index } = await request.json()

  // Get upload record
  const upload = await db.file_uploads.findOne({ upload_id })
  if (!upload) return new Response('Upload not found', { status: 404 })

  // Read chunk from temp file
  const fd = await fs.open(upload.temp_path, 'r')
  const chunkBuffer = Buffer.alloc(upload.chunk_size)
  const offset = chunk_index * upload.chunk_size
  const { bytesRead } = await fd.read(chunkBuffer, 0, upload.chunk_size, offset)
  await fd.close()

  const chunkData = chunkBuffer.slice(0, bytesRead)

  // Push uploadchunk action to blockchain
  const api = new Api({ /* eosjs config */ })
  const result = await api.transact({
    actions: [{
      account: 'verartacore',
      name: 'uploadchunk',
      authorization: [{ actor: session.blockchain_account, permission: 'active' }],
      data: {
        owner: session.blockchain_account,
        file_id: upload.file_id,
        chunk_index,
        chunk_data: Array.from(chunkData),
      },
    }]
  }, { blocksBehind: 3, expireSeconds: 30 })

  // Record chunk upload
  await db.chunk_uploads.create({
    file_upload_id: upload.id,
    chunk_index,
    tx_id: result.transaction_id,
  })

  // Update progress
  await db.file_uploads.update(upload.id, {
    uploaded_chunks: upload.uploaded_chunks + 1
  })

  return new Response(JSON.stringify({
    tx_id: result.transaction_id,
    uploaded_chunks: upload.uploaded_chunks + 1,
    total_chunks: upload.total_chunks,
  }), { status: 200 })
}
```

```typescript
// Backend: src/pages/api/artworks/upload-complete.ts
import type { APIRoute } from 'astro'
import fs from 'fs/promises'

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await validateSession(cookies.get('session'))
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { upload_id } = await request.json()

  const upload = await db.file_uploads.findOne({ upload_id })
  if (!upload) return new Response('Upload not found', { status: 404 })

  // Verify all chunks uploaded
  if (upload.uploaded_chunks !== upload.total_chunks) {
    return new Response('Upload incomplete', { status: 400 })
  }

  // Delete temp file
  await fs.unlink(upload.temp_path)
  await fs.rmdir(path.dirname(upload.temp_path))

  // Mark complete
  await db.file_uploads.update(upload.id, {
    upload_complete: true,
    completed_at: new Date(),
  })

  return new Response(JSON.stringify({
    file_id: upload.file_id,
    file_hash: upload.file_hash,
  }), { status: 200 })
}
```

```cpp
// Smart Contract: contracts/verarta.core/verarta.core.cpp
ACTION verartacore::createart(name owner, string title) {
  require_auth(owner);

  artworks_table artworks(get_self(), get_self().value);
  artworks.emplace(owner, [&](auto& row) {
    row.id = artworks.available_primary_key();
    row.owner = owner;
    row.title = title;
    row.created_at = current_time_point().sec_since_epoch();
    row.file_count = 0;
  });
}

ACTION verartacore::addfile(
  name owner,
  uint64_t artwork_id,
  string filename,
  string mime_type,
  uint64_t file_size,
  string file_hash,
  uint32_t chunk_count,
  bool is_thumbnail
) {
  require_auth(owner);

  // Verify artwork exists and owner matches
  artworks_table artworks(get_self(), get_self().value);
  auto artwork_itr = artworks.find(artwork_id);
  check(artwork_itr != artworks.end(), "Artwork not found");
  check(artwork_itr->owner == owner, "Not artwork owner");

  // Create file record
  artfiles_table artfiles(get_self(), get_self().value);
  artfiles.emplace(owner, [&](auto& row) {
    row.id = artfiles.available_primary_key();
    row.artwork_id = artwork_id;
    row.owner = owner;
    row.filename = filename;
    row.mime_type = mime_type;
    row.file_size = file_size;
    row.file_hash = file_hash;
    row.chunk_count = chunk_count;
    row.uploaded_chunks = 0;
    row.upload_complete = false;
    row.created_at = current_time_point().sec_since_epoch();
    row.is_thumbnail = is_thumbnail;
  });
}

ACTION verartacore::uploadchunk(
  name owner,
  uint64_t file_id,
  uint32_t chunk_index,
  vector<uint8_t> chunk_data
) {
  require_auth(owner);

  // Get file record
  artfiles_table artfiles(get_self(), get_self().value);
  auto file_itr = artfiles.find(file_id);
  check(file_itr != artfiles.end(), "File not found");
  check(file_itr->owner == owner, "Not file owner");
  check(chunk_index < file_itr->chunk_count, "Invalid chunk index");

  // Chunk data is stored in action data (indexed by Hyperion)
  // Update progress
  artfiles.modify(file_itr, owner, [&](auto& row) {
    row.uploaded_chunks++;
    if (row.uploaded_chunks == row.chunk_count) {
      row.upload_complete = true;

      // Increment artwork file_count
      artworks_table artworks(get_self(), get_self().value);
      auto artwork_itr = artworks.find(row.artwork_id);
      artworks.modify(artwork_itr, owner, [&](auto& art) {
        art.file_count++;
      });
    }
  });
}
```

#### Retrieving and Reassembling Files

```typescript
// Backend: src/pages/api/artworks/files/[id].ts
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, cookies }) => {
  const session = await validateSession(cookies.get('session'))
  if (!session) return new Response('Unauthorized', { status: 401 })

  const fileId = params.id

  // Get file metadata from blockchain table
  const fileTable = await chainClient.v1.chain.get_table_rows({
    code: 'verartacore',
    table: 'artfiles',
    scope: 'verartacore',
    lower_bound: fileId,
    upper_bound: fileId,
    limit: 1,
  })

  const file = fileTable.rows[0]
  if (!file) return new Response('File not found', { status: 404 })

  // Query Hyperion for all uploadchunk actions for this file
  const hyperionRes = await fetch(
    `${HYPERION_URL}/v2/history/get_actions?` +
    `account=${file.owner}&` +
    `filter=verartacore:uploadchunk&` +
    `limit=${file.chunk_count * 2}` // safety margin
  )
  const history = await hyperionRes.json()

  // Filter and sort chunks for this file_id
  const chunks = history.actions
    .filter(a => a.act.data.file_id === fileId)
    .sort((a, b) => a.act.data.chunk_index - b.act.data.chunk_index)
    .map(a => a.act.data.chunk_data)

  // Verify we have all chunks
  if (chunks.length !== file.chunk_count) {
    return new Response('Incomplete file', { status: 500 })
  }

  // Reassemble file
  const fileBuffer = Buffer.concat(chunks.map(c => Buffer.from(c)))

  // Verify hash
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  if (hash !== file.file_hash) {
    return new Response('File integrity check failed', { status: 500 })
  }

  // Stream file to client
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Length': file.file_size.toString(),
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    },
  })
}
```

```typescript
// Frontend: src/hooks/useArtworks.ts
import { useQuery } from '@tanstack/react-query'

export function useArtworks(account: string) {
  return useQuery({
    queryKey: ['artworks', account],
    queryFn: async () => {
      // Get artworks from contract table
      const artworksRes = await fetch(`/api/contracts/tables?contract=verartacore&table=artworks&scope=verartacore&index_position=2&key_type=name&lower_bound=${account}&upper_bound=${account}`)
      const artworks = await artworksRes.json()

      // For each artwork, get files
      const artworksWithFiles = await Promise.all(
        artworks.rows.map(async (artwork) => {
          const filesRes = await fetch(`/api/contracts/tables?contract=verartacore&table=artfiles&scope=verartacore&index_position=2&key_type=i64&lower_bound=${artwork.id}&upper_bound=${artwork.id}`)
          const files = await filesRes.json()

          // Find thumbnail
          const thumbnail = files.rows.find(f => f.is_thumbnail)

          return {
            ...artwork,
            files: files.rows,
            thumbnail_url: thumbnail ? `/api/artworks/files/${thumbnail.id}` : null,
          }
        })
      )

      return artworksWithFiles
    }
  })
}
```

#### Benefits of This Approach

✅ **Minimal RAM usage** — Only metadata in contract tables, not multi-MB files
✅ **Full auditability** — All files are part of immutable blockchain history
✅ **Indexed & queryable** — Hyperion makes file retrieval fast via REST API
✅ **No external storage** — No S3, IPFS, or CDN required (Hyperion is the storage layer)
✅ **Integrity guaranteed** — File hash stored on-chain, can verify file hasn't been tampered with

#### Limitations

⚠️ **File size limits** — Action data is typically limited to a few MB per transaction (chain-dependent)
⚠️ **Retrieval speed** — Querying Hyperion is slower than CDN (but acceptable for private chain use cases)
⚠️ **Hyperion dependency** — If Hyperion goes down, file retrieval fails (metadata still accessible via chain API)

---

## Nginx Reverse Proxy

Nginx runs on the production server and maps `verarta.com` subdomains to internal services. All traffic is HTTPS via Let's Encrypt.

### Subdomain Mapping

| URL | Internal Target | Service |
|-----|-----------------|---------|
| `verarta.com` / `www.verarta.com` | `localhost:4321` | Astro app (main site + frontend) |
| `explorer.verarta.com` | `localhost:4321/explorer/` | Block explorer (Astro SSR pages) |
| `chain.verarta.com` | `localhost:8888` | History node Chain API |
| `hyperion.verarta.com` | `localhost:7000` | Hyperion REST + Swagger |
| `hyperion.verarta.com/socket.io/` | `localhost:7000` | Hyperion streaming (Socket.IO upgrade) |
| `registry.verarta.com` | `localhost:5000` | Private Docker registry |
| `seed1.verarta.com:9876` | `localhost:9000` | Producer 1 P2P (TCP passthrough) |
| `seed2.verarta.com:9876` | `localhost:9004` | History node P2P (TCP passthrough) |

### Nginx Configuration

**`/etc/nginx/sites-available/verarta.com`**
```nginx
# ── Main site (Astro) ──────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name verarta.com www.verarta.com;

    ssl_certificate     /etc/letsencrypt/live/verarta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verarta.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE endpoints — disable buffering
    location /api/stream/ {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}

# ── Block Explorer ─────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name explorer.verarta.com;

    ssl_certificate     /etc/letsencrypt/live/verarta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verarta.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4321/explorer/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ── Chain API ──────────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name chain.verarta.com;

    ssl_certificate     /etc/letsencrypt/live/verarta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verarta.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# ── Hyperion API + Streaming ───────────────────────────────────
server {
    listen 443 ssl http2;
    server_name hyperion.verarta.com;

    ssl_certificate     /etc/letsencrypt/live/verarta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verarta.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.IO upgrade for Hyperion streaming
    location /socket.io/ {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# ── Private Docker Registry ───────────────────────────────────
server {
    listen 443 ssl http2;
    server_name registry.verarta.com;

    ssl_certificate     /etc/letsencrypt/live/verarta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verarta.com/privkey.pem;

    client_max_body_size 2G;  # Docker image layers can be large

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ── HTTP → HTTPS redirect ─────────────────────────────────────
server {
    listen 80;
    server_name verarta.com www.verarta.com explorer.verarta.com
                chain.verarta.com hyperion.verarta.com registry.verarta.com;
    return 301 https://$host$request_uri;
}
```

**P2P seed nodes** (TCP passthrough, not HTTP — requires `stream` module):

```nginx
# /etc/nginx/nginx.conf — add in the top-level (outside http block)
stream {
    # Seed node 1 — Producer 1 P2P
    server {
        listen 9876;
        proxy_pass 127.0.0.1:9000;
    }
}
```

For `seed2.verarta.com`, use a separate IP or a different external port, or rely on DNS pointing directly to the history node.

### Private Docker Registry

Run a Docker registry container on the server:

```bash
docker run -d --restart=always --name registry \
  -v /opt/verarta/registry:/var/lib/registry \
  -p 5000:5000 \
  registry:2
```

Nginx proxies `registry.verarta.com` → `localhost:5000` with TLS. Add basic auth via Nginx or registry's built-in htpasswd:

```nginx
# Inside the registry server block
auth_basic "Registry";
auth_basic_user_file /etc/nginx/htpasswd.registry;
```

---

## Project Structure (Monorepo)

```
verarta.com/
├── PLAN.md                          # This file
├── docker-compose.yml               # Full network: producers + history + Hyperion + infra
├── nginx/
│   └── verarta.com.conf             # Nginx site config
├── blockchain/
│   ├── Dockerfile                   # Multi-stage: build Spring from source with patches
│   ├── bios-boot-tutorial.py        # Customized bootstrap script (from Spring)
│   ├── accounts.json                # 4 producers + initial users
│   ├── genesis.json                 # Chain genesis configuration
│   ├── config/
│   │   ├── producer1.ini            # Producer 1 config (signature-provider, etc.)
│   │   ├── producer2.ini
│   │   ├── producer3.ini
│   │   ├── producer4.ini
│   │   └── history.ini              # History node config
│   ├── hyperion/
│   │   ├── Dockerfile               # Hyperion image (Node 22 + PM2 + hyperion-history-api)
│   │   ├── connections.json         # Hyperion connection config
│   │   └── config/
│   │       └── verarta.config.json  # Chain-specific indexer/API config
│   ├── contracts/                   # Custom smart contracts (C++)
│   │   ├── verarta.token/
│   │   └── verarta.core/
│   ├── join-node/                   # Distributable kit for remote servers
│   │   ├── genesis.json             # Copy of chain genesis
│   │   ├── .env.example             # Template: PEER_1=seed1.verarta.com:9876
│   │   └── docker-compose.yml       # Single-node compose (api + history profile)
│   └── scripts/
│       └── bootstrap.sh             # Runs bios-boot-tutorial.py against Docker network
├── backend/                         # Astro SSR application
│   ├── src/
│   │   ├── pages/
│   │   │   ├── api/                 # REST API + SSE endpoints
│   │   │   ├── explorer/            # Block explorer SSR pages
│   │   │   └── [...slug].astro
│   │   ├── lib/                     # @wharfkit/antelope client, Hyperion helpers
│   │   └── middleware/
│   ├── astro.config.mjs
│   └── package.json
├── frontend/                        # React components (Astro islands)
│   ├── src/
│   │   ├── components/              # React components
│   │   ├── hooks/                   # useWebAuthn, useTransact, useHyperionStream, etc.
│   │   └── lib/                     # webauthn.ts, hyperion-stream.ts, config.ts
│   └── package.json
└── package.json                     # Root workspace (npm/pnpm workspaces)
```

---

## Implementation Phases

### Phase 1: Infrastructure & Blockchain Setup
- [ ] Set up production server with Nginx, Let's Encrypt, private Docker registry
- [ ] Write `blockchain/Dockerfile` (multi-stage: patch block interval -> build from source -> lean runtime)
- [ ] Build and push `registry.verarta.com/verarta/spring:latest`
- [ ] Create `genesis.json` with custom chain ID
- [ ] Create `accounts.json` with 4 producer key pairs
- [ ] Write per-producer `.ini` configs (signature-provider keys) and `history.ini`
- [ ] Write `docker-compose.yml` for the full network (producers + history + Hyperion stack)
- [ ] Configure Nginx subdomain routing
- [ ] Customize `bios-boot-tutorial.py` for 4 producers + 1 history node
- [ ] Run `docker compose up -d` and bootstrap the chain
- [ ] Verify all 4 producers are producing blocks (5s interval)
- [ ] Verify history node is syncing and serving SHiP
- [ ] Deploy and verify Hyperion (indexer + API at `hyperion.verarta.com`)
- [ ] Build `blockchain/join-node/` kit
- [ ] Set up seed node DNS (`seed1.verarta.com`, `seed2.verarta.com`)

### Phase 2: Backend (Astro)
- [ ] Initialize Astro project with `@astrojs/node` adapter
- [ ] Set up `git push prod` deployment (bare repo + post-receive hook + PM2)
- [ ] Install `@wharfkit/antelope`, `nodemailer`, `jsonwebtoken`, `pg` (PostgreSQL client)
- [ ] Set up PostgreSQL database with `users` table schema
- [ ] Implement user registration endpoints:
  - [ ] `POST /api/accounts/register` — email + name, send verification code
  - [ ] `POST /api/accounts/verify-email` — validate code, return WebAuthn challenge
  - [ ] `POST /api/accounts/create` — create blockchain account with WebAuthn pubkey
- [ ] Implement authentication endpoints:
  - [ ] `POST /api/auth/login` — session creation with JWT
  - [ ] `POST /api/auth/logout` — clear session
  - [ ] `GET /api/auth/session` — get current user info
- [ ] Implement session middleware with role-based access control (regular vs admin)
- [ ] Implement chain API endpoints (info, block, account, tables)
- [ ] Implement Hyperion proxy endpoints (actions, transactions, transfers)
- [ ] Implement SSE streaming endpoint for chain info
- [ ] Implement artwork management endpoints:
  - [ ] `POST /api/artworks/create` — create artwork (metadata only)
  - [ ] `GET /api/artworks/list` — list user's artworks with thumbnails
  - [ ] `GET /api/artworks/[id]` — get artwork details
  - [ ] `POST /api/artworks/delete` — delete artwork
  - [ ] `POST /api/artworks/upload-start` — save file to temp location, return upload_id
  - [ ] `POST /api/artworks/upload-chunk` — upload single chunk to blockchain
  - [ ] `POST /api/artworks/upload-complete` — finalize upload, delete temp file
  - [ ] `GET /api/artworks/files/[id]` — retrieve and reassemble file from Hyperion chunks
  - [ ] `POST /api/artworks/files/delete` — delete file from artwork
- [ ] Implement temp file cleanup cron job (delete abandoned uploads after 24h)
- [ ] Add error handling, validation, CORS
- [ ] Set up email sending (SMTP configuration)

### Phase 3: Frontend (React + WebAuthn)
- [ ] Set up React components as Astro islands
- [ ] Install `eosjs`, `cbor-x`, `@eosrio/hyperion-stream-client`, `@tanstack/react-query`
- [ ] Build user registration flow:
  - [ ] `RegisterForm.tsx` — email + name input
  - [ ] `VerifyEmail.tsx` — 6-digit code input
  - [ ] WebAuthn enrollment (biometric key generation)
  - [ ] Account creation confirmation
- [ ] Build authentication components:
  - [ ] `LoginForm.tsx` — user login with session
  - [ ] `AccountInfo.tsx` — display current user info
  - [ ] Protected route wrapper (check session + role)
- [ ] Build artwork management UI:
  - [ ] `ArtworkList.tsx` — grid of artwork cards with thumbnails
  - [ ] `ArtworkCard.tsx` — thumbnail + title + creation date
  - [ ] `CreateArtwork.tsx` — form with multi-file upload (title + images/documents)
  - [ ] `ArtworkDetail.tsx` — full artwork view with file gallery + download
  - [ ] `FileUpload.tsx` — drag-drop multi-file upload with chunked upload progress bars
  - [ ] `FileUploadProgress.tsx` — per-file progress indicator (uploaded_chunks / total_chunks)
- [ ] Build biometric transaction signing component
- [ ] Build Dashboard with SSE chain info + Hyperion live feed
- [ ] Build Block Explorer pages (blocks, transactions, accounts, search)
- [ ] Build Token balance + transfer UI
- [ ] Build Contract table explorer + action forms (admin only)

### Phase 4: Smart Contracts
- [ ] Set up CDT (Contract Development Toolkit) environment
- [ ] Develop `verarta.core` smart contract:
  - [ ] Define `artworks` table structure (id, owner, title, created_at, file_count)
  - [ ] Define `artfiles` table structure (id, artwork_id, owner, filename, mime_type, file_size, file_hash, chunk_count, uploaded_chunks, upload_complete, is_thumbnail)
  - [ ] Implement `createart` action (create artwork with metadata only)
  - [ ] Implement `addfile` action (register file for artwork, set chunk_count)
  - [ ] Implement `uploadchunk` action (validate chunk_index, increment uploaded_chunks, mark complete when done)
  - [ ] Implement `deleteart` action (delete artwork + all files, free RAM)
  - [ ] Implement `deletefile` action (delete single file from artwork)
  - [ ] Add secondary indices for querying by owner and artwork_id
- [ ] Write unit tests for contract actions
- [ ] Compile contract to WASM + generate ABI
- [ ] Deploy `verarta.core` contract to blockchain
- [ ] Test contract actions via `cleos` and Hyperion indexing
- [ ] Verify file data is indexed and retrievable from Hyperion

### Phase 5: Integration & Polish
- [ ] End-to-end testing: Full user journey
  - [ ] Register new user -> verify email -> WebAuthn enrollment
  - [ ] Create artwork -> upload file -> view in gallery
  - [ ] Biometric signing -> on-chain action -> Hyperion indexing
  - [ ] Retrieve artwork file from Hyperion -> display/download
  - [ ] View transaction in block explorer
- [ ] Test admin vs regular user access control
- [ ] Test file size limits and error handling
- [ ] Write `blockchain/scripts/bootstrap.sh` to automate full chain init
- [ ] Test remote join: spin up a fresh server with the join-node kit
- [ ] Load testing Nginx + Astro + blockchain pipeline
- [ ] Documentation for local development setup
- [ ] Database migration scripts for PostgreSQL schema

---

## Hardware Requirements

*Estimates for a private chain with 5-second block intervals and low-to-moderate activity.*

### RAM by Service

| Service | Min | Recommended | Notes |
|---------|-----|-------------|-------|
| Producer nodes (x4) | 2 GB each | 4 GB each | Chain state DB is memory-mapped |
| History node | 4 GB | 8 GB | State DB + SHiP buffers |
| Elasticsearch | 2 GB | 4 GB | JVM heap (`ES_JAVA_OPTS`) |
| RabbitMQ | 256 MB | 512 MB | Message queuing |
| Redis | 128 MB | 256 MB | Caching layer |
| MongoDB | 256 MB | 512 MB | State data |
| PostgreSQL | 256 MB | 512 MB | User accounts & metadata |
| Hyperion Indexer | 1 GB | 2 GB | Node.js + deserializer workers |
| Hyperion API | 512 MB | 1 GB | Fastify + Socket.IO |
| Astro backend (PM2) | 256 MB | 512 MB | SSR + API routes |
| Nginx | 50 MB | 50 MB | Reverse proxy |
| Docker Registry | 128 MB | 256 MB | Image serving |
| OS overhead | 1 GB | 2 GB | Kernel, systemd, etc. |
| **Total** | **~18.5 GB** | **~35.5 GB** | |

### Disk Usage

| Data | Initial | Growth Rate (5s blocks) | 1 Year Estimate |
|------|---------|------------------------|-----------------|
| Spring Docker image | 1 GB | — | 1 GB |
| Producer chain data (x4) | 100 MB each | ~50 MB/day each | ~75 GB total |
| History node chain data | 200 MB | ~100 MB/day | ~37 GB |
| SHiP (state history files) | 100 MB | ~200 MB/day | ~73 GB |
| Elasticsearch indices | 500 MB | ~100-500 MB/day | ~50-180 GB |
| MongoDB | 50 MB | ~10 MB/day | ~4 GB |
| RabbitMQ + Redis | negligible | negligible | < 1 GB |
| Docker registry (images) | 2 GB | per push | ~5-10 GB |
| Astro app + node_modules | 500 MB | — | 500 MB |
| **Total** | **~5 GB** | | **~250-400 GB year 1** |

### Server Sizing

| Setup | RAM | Disk | CPU | Use Case |
|-------|-----|------|-----|----------|
| **Dev / Testing** | 16 GB | 50 GB SSD | 4 cores | Local development, all on one machine |
| **Production (single server)** | 32-64 GB | 500 GB SSD | 8+ cores | Low-traffic private chain |
| **Production (split)** | 16 GB + 32 GB | 100 GB + 500 GB | 4c + 8c | Blockchain nodes on server 1, Hyperion stack on server 2 |

The heaviest consumers are **Elasticsearch** (RAM + disk) and the **producer nodes** (RAM for chain state). With 5-second blocks the chain produces ~17,000 blocks/day vs ~170,000 on a default 0.5s chain — roughly **10x slower** disk growth than public Antelope chains.

---

## Key Dependencies

```
# Blockchain
AntelopeIO/spring              >= v1.2.2
AntelopeIO/cdt                 >= v4.1.0
AntelopeIO/reference-contracts
eosrio/hyperion-history-api    >= v3.6

# Hyperion Infrastructure (Docker)
elasticsearch                  8.x
rabbitmq                       4.x
redis                          8.x
mongodb                        8.x

# Backend (Astro)
astro                          >= 5.x
@astrojs/node                  # Node adapter for SSR
@wharfkit/antelope             # Core Antelope types & API client
nodemailer                     >= 6.x         # Email sending (SMTP)
jsonwebtoken                   >= 9.x         # JWT session management
pg                             >= 8.x         # PostgreSQL client
bcrypt                         >= 5.x         # Password hashing (if needed)
ioredis                        >= 5.x         # Redis client for verification codes

# Frontend (React)
react                          >= 19.x
react-dom                      >= 19.x
eosjs                          >= 22.x        # Transaction building + WebAuthn signing
cbor-x                         >= 1.5         # CBOR decoding for WebAuthn attestation
@eosrio/hyperion-stream-client >= 1.x         # Real-time streaming from Hyperion
@tanstack/react-query          >= 5.x
tailwindcss                    >= 4.x

# Server
nginx                          >= 1.24
pm2                            >= 5.x
certbot                        # Let's Encrypt
docker + docker-compose
postgresql                     >= 16.x        # User database
```
