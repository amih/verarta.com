# Multi-stage Dockerfile for Antelope Spring
# Builds from source with custom block interval (5s) and transaction limits

# ──────────────────────────────────────────────────────────────
# Stage 1: Build Spring from source
# ──────────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS builder

# Build arguments for customization
ARG SPRING_VERSION=v1.2.2
ARG BLOCK_INTERVAL_MS=5000
ARG PRODUCER_REPETITIONS=6
ARG MAX_INLINE_ACTION_SIZE=524288

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libcurl4-openssl-dev \
    libgmp-dev \
    llvm-11-dev \
    python3-numpy \
    file \
    zlib1g-dev \
    libssl-dev \
    libboost-all-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone Spring repository
WORKDIR /spring
RUN git clone --recursive https://github.com/AntelopeIO/spring.git . \
    && git fetch --all --tags \
    && git checkout ${SPRING_VERSION} \
    && git submodule update --init --recursive

# Patch config.hpp for custom block interval and limits
RUN sed -i \
    "s/block_interval_ms = 500;/block_interval_ms = ${BLOCK_INTERVAL_MS};/" \
    libraries/chain/include/eosio/chain/config.hpp \
 && sed -i \
    "s/producer_repetitions = 12;/producer_repetitions = ${PRODUCER_REPETITIONS};/" \
    libraries/chain/include/eosio/chain/config.hpp \
 && sed -i \
    "s/default_max_inline_action_size = 512 \* 1024;/default_max_inline_action_size = ${MAX_INLINE_ACTION_SIZE};/" \
    libraries/chain/include/eosio/chain/config.hpp

# Verify patches applied
RUN echo "=== Verifying config.hpp patches ===" \
 && grep "block_interval_ms = ${BLOCK_INTERVAL_MS}" libraries/chain/include/eosio/chain/config.hpp \
 && grep "producer_repetitions = ${PRODUCER_REPETITIONS}" libraries/chain/include/eosio/chain/config.hpp \
 && grep "default_max_inline_action_size = ${MAX_INLINE_ACTION_SIZE}" libraries/chain/include/eosio/chain/config.hpp \
 && echo "=== Patches verified ==="

# Build Spring
RUN mkdir -p build && cd build \
    && cmake -DCMAKE_BUILD_TYPE=Release \
             -DCMAKE_PREFIX_PATH=/usr/lib/llvm-11 \
             -DCMAKE_INSTALL_PREFIX=/usr/local \
             .. \
    && make -j "$(nproc)" \
    && make install

# Verify binaries built successfully
RUN nodeos --version && cleos --version && keosd --version

# ──────────────────────────────────────────────────────────────
# Stage 2: Runtime image (minimal)
# ──────────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libcurl4 \
    libgmp10 \
    zlib1g \
    libssl3 \
    libboost-filesystem1.74.0 \
    libboost-program-options1.74.0 \
    libboost-system1.74.0 \
    libboost-thread1.74.0 \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries from builder
COPY --from=builder /usr/local/bin/nodeos   /usr/local/bin/
COPY --from=builder /usr/local/bin/cleos    /usr/local/bin/
COPY --from=builder /usr/local/bin/keosd    /usr/local/bin/

# Create data directories
RUN mkdir -p /data /config /wallet

# Expose ports
# 8888 - HTTP API
# 9876 - P2P
# 8080 - State History (SHiP)
EXPOSE 8888 9876 8080

# Default entrypoint
ENTRYPOINT ["nodeos"]
CMD ["--data-dir=/data", "--config-dir=/config"]
