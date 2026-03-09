#!/bin/bash
# Set the multi-producer schedule on the Verarta production chain.
#
# Prerequisites:
#   - All 23 protocol features activated (run activate-features.sh first)
#   - CDT 4.1.0+ installed (cdt-cpp available)
#
# This script:
#   1. Builds a minimal setprods contract
#   2. Deploys it temporarily to eosio
#   3. Calls setprods with the 4 producer signing keys
#   4. Waits for the schedule change to take effect
#   5. Restores eosio.boot to eosio
#
# WARNING: Once the multi-producer schedule is active, eosio stops producing.
#          To revert, restore from snapshot taken before this step.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLEOS="cleos -u http://localhost:8000 --wallet-url http://localhost:6666"
BOOT_CONTRACT="/opt/verarta/app/blockchain/contracts/reference-contracts/build/contracts/eosio.boot"
EOSIO_PRIVKEY="5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

get_info() {
  curl -sf http://localhost:8000/v1/chain/get_info
}

get_head() {
  get_info | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_num'])"
}

wait_for_block() {
  local old_block
  old_block=$(get_head)
  for i in $(seq 1 30); do
    sleep 2
    local new_block
    new_block=$(get_head 2>/dev/null) || continue
    if [ "$new_block" -gt "$old_block" ]; then
      ok "New block: $new_block"
      return 0
    fi
  done
  fail "No new block after 60 seconds"
}

wait_for_blocks() {
  local count="${1:-5}"
  local start_head
  start_head=$(get_head)
  echo "  Waiting for $count blocks from $start_head..."
  for i in $(seq 1 $((count * 12))); do
    sleep 1
    local current
    current=$(get_head 2>/dev/null) || continue
    if [ "$((current - start_head))" -ge "$count" ]; then
      echo "  Reached block $current"
      return 0
    fi
  done
  local final
  final=$(get_head)
  echo "  Got $((final - start_head)) blocks (target was $count)"
}

# Wallet management
WALLET_NAME="setprods-tmp-$$"
wallet_created=false

cleanup() {
  if [ "$wallet_created" = true ]; then
    echo "Cleaning up wallet '$WALLET_NAME'..."
    $CLEOS wallet lock -n "$WALLET_NAME" 2>/dev/null || true
    rm -f ~/eosio-wallet/"${WALLET_NAME}".wallet 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Verarta Production Chain: Set Multi-Producer Schedule ==="
echo ""

# ─── Step 1: Verify prerequisites ───
echo "─── Step 1: Verify prerequisites ───"
INFO=$(get_info)
echo "$INFO" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'  Chain: {d.get(\"server_version_string\",\"unknown\")}')
print(f'  Head: {d[\"head_block_num\"]}, LIB: {d[\"last_irreversible_block_num\"]}')
print(f'  Producer: {d[\"head_block_producer\"]}')
"

# Check if multi-producer schedule is already active
SCHEDULE_VER=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('schedule_version', 0))")
if [ "$SCHEDULE_VER" -ge 1 ]; then
  ok "Multi-producer schedule already active (version $SCHEDULE_VER)"
  echo "Nothing to do!"
  exit 0
fi
echo ""

# ─── Step 2: Build the setprods contract ───
echo "─── Step 2: Build setprods contract ───"
CONTRACT_DIR="$SCRIPT_DIR/../contracts/setprods"
BUILD_DIR="$CONTRACT_DIR/build"
mkdir -p "$BUILD_DIR"

cdt-cpp -abigen \
  -o "$BUILD_DIR/setprods.wasm" \
  "$CONTRACT_DIR/setprods.cpp" \
  -I"$CONTRACT_DIR" \
  || fail "Failed to build setprods contract"

ok "setprods contract built"
echo ""

# ─── Step 3: Setup wallet ───
echo "─── Step 3: Setup wallet ───"
WALLET_OUTPUT=$($CLEOS wallet create -n "$WALLET_NAME" --to-console 2>&1) || {
  echo "$WALLET_OUTPUT"
  fail "Failed to create wallet"
}
wallet_created=true

$CLEOS wallet import -n "$WALLET_NAME" --private-key "$EOSIO_PRIVKEY" 2>&1 || {
  warn "Key import warning (may already exist)"
}
ok "Wallet '$WALLET_NAME' ready with eosio key"
echo ""

# ─── Step 4: Deploy setprods contract to eosio ───
echo "─── Step 4: Deploy setprods contract to eosio ───"
$CLEOS set contract eosio "$BUILD_DIR" setprods.wasm setprods.abi -p eosio@active \
  || fail "Failed to deploy setprods contract to eosio"
ok "setprods contract deployed to eosio"

wait_for_block
echo ""

# ─── Step 5: Set the 4-producer schedule ───
echo "─── Step 5: Set producer schedule (4 producers) ───"
echo ""
echo "  Producer keys (from config):"
echo "  producer1: EOS54tpWVS9LsuV1iv4uUb7PA6YfMMWP5cdWrt7Gtevprp6udCEb3"
echo "  producer2: EOS5AsMDJQaHdJjmBts2YkxpEMEUkKwCPpo9LmSSF23go65AuErTT"
echo "  producer3: EOS7qrnoGgXYMHYPmup2XHQNytpjHMgV5torsBmRNkXpdmPBZnGqL"
echo "  producer4: EOS67cJXZnguoN7bGZhKFBo2D2zRhdSXtJXXpYPEnSdPDJpC9UGs2"
echo ""

# Producer schedule must be sorted alphabetically by producer name
SCHEDULE_JSON='[
  {"producer_name":"producer1","block_signing_key":"EOS54tpWVS9LsuV1iv4uUb7PA6YfMMWP5cdWrt7Gtevprp6udCEb3"},
  {"producer_name":"producer2","block_signing_key":"EOS5AsMDJQaHdJjmBts2YkxpEMEUkKwCPpo9LmSSF23go65AuErTT"},
  {"producer_name":"producer3","block_signing_key":"EOS7qrnoGgXYMHYPmup2XHQNytpjHMgV5torsBmRNkXpdmPBZnGqL"},
  {"producer_name":"producer4","block_signing_key":"EOS67cJXZnguoN7bGZhKFBo2D2zRhdSXtJXXpYPEnSdPDJpC9UGs2"}
]'

$CLEOS push action eosio setprods "[${SCHEDULE_JSON}]" -p eosio@active \
  || fail "Failed to set producer schedule"
ok "Producer schedule set!"
echo ""

# ─── Step 6: Wait for schedule change to take effect ───
echo "─── Step 6: Wait for schedule change ───"
echo "The new schedule becomes active after LIB advances past the proposal block."
echo "With a single producer (eosio), this should happen quickly."
echo ""

for round in $(seq 1 20); do
  wait_for_blocks 3
  INFO=$(get_info)
  SCHED_VER=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('schedule_version', 0))")
  PRODUCER=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_producer'])")
  HEAD=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_num'])")
  echo "  Round $round — Head: $HEAD, Schedule: v$SCHED_VER, Producer: $PRODUCER"

  if [ "$SCHED_VER" -ge 1 ]; then
    echo ""
    ok "Multi-producer schedule is ACTIVE (v$SCHED_VER)!"
    break
  fi

  if [ "$round" -eq 20 ]; then
    echo ""
    warn "Schedule still at v$SCHED_VER after waiting. Check chain logs."
  fi
done
echo ""

# ─── Step 7: Verify multiple producers ───
echo "─── Step 7: Verify producers are rotating ───"
echo "Watching blocks for ~30 seconds to confirm all producers appear..."
declare -A seen_producers
for i in $(seq 1 6); do
  sleep 5
  PRODUCER=$(get_info | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_producer'])")
  seen_producers["$PRODUCER"]=1
  echo "  Block producer: $PRODUCER"
done

echo ""
echo "Producers seen: ${!seen_producers[*]}"
SEEN_COUNT=${#seen_producers[@]}
if [ "$SEEN_COUNT" -ge 3 ]; then
  ok "At least $SEEN_COUNT different producers observed"
else
  warn "Only $SEEN_COUNT producers seen — check that all nodes are healthy"
fi
echo ""

# ─── Step 8: Restore eosio.boot ───
echo "─── Step 8: Restore eosio.boot to eosio ───"
$CLEOS set contract eosio "$BOOT_CONTRACT" -p eosio@active \
  || fail "Failed to restore eosio.boot"
ok "eosio.boot restored on eosio"
echo ""

# ─── Final status ───
echo "=== Final Status ==="
INFO=$(get_info)
echo "$INFO" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'  Head: {d[\"head_block_num\"]}, LIB: {d[\"last_irreversible_block_num\"]}')
print(f'  Schedule version: {d.get(\"schedule_version\", 0)}')
print(f'  Current producer: {d[\"head_block_producer\"]}')
"
echo ""
echo "=== Done ==="
echo ""
echo "IMPORTANT: eosio is no longer a producer. This is irreversible without snapshot restore."
