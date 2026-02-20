FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# node:22-slim and node:22-bookworm only ship GLIBCXX_3.4.30, but
# @eosrio/node-abieos (native addon) requires GLIBCXX_3.4.32.
# ubuntu:24.04 provides the needed version via its libstdc++6 package.
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    python3 \
    make \
    g++ \
    git \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# PM2 is used internally by Hyperion to manage worker processes
RUN npm install -g pm2

WORKDIR /hyperion-history-api

COPY . .

# --ignore-scripts skips the postinstall tsc run (no node_modules yet at that point)
RUN npm install --ignore-scripts

RUN npm run build

RUN node scripts/fix-permissions.cjs 2>/dev/null || true

# Config is volume-mounted at runtime: config/chains/ and config/connections.json
RUN mkdir -p config/chains

EXPOSE 7000 7001 7002

# CMD is overridden per container in docker-compose.yml:
#   hyperion-indexer: --only verarta-indexer
#   hyperion-api:     --only verarta-api
CMD ["pm2-runtime", "start", "pm2/ecosystem.config.cjs", "--only", "verarta-indexer"]
