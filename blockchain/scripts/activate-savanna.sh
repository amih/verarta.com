#!/bin/bash
# Activate Savanna instant finality on the Verarta production chain.
#
# Prerequisites:
#   - All 23 protocol features activated (run activate-features.sh first)
#   - Multi-producer schedule active (run set-producers.sh first)
#   - BLS signature-providers configured in all 4 producer configs and nodes restarted
#   - BLS keys in blockchain/.env
#   - CDT 4.1.0+ installed (cdt-cpp available)
#
# This script:
#   1. Builds a minimal setfinalizer contract
#   2. Deploys it temporarily to eosio
#   3. Calls set_finalizers with a 3-of-4 finalizer policy
#   4. Waits for the Savanna transition to complete
#   5. Restores eosio.boot to eosio
#
# WARNING: Once Savanna finality activates, it is irreversible.
#          To revert, restore from a snapshot taken before this step.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BLOCKCHAIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLEOS="cleos -u http://localhost:8000 --wallet-url http://localhost:6666"
BOOT_CONTRACT="/opt/verarta/app/blockchain/contracts/reference-contracts/build/contracts/eosio.boot"
EOSIO_PRIVKEY="5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3"

# Source BLS keys
if [ ! -f "$BLOCKCHAIN_DIR/.env" ]; then
  echo "ERROR: $BLOCKCHAIN_DIR/.env not found."
  echo "Generate BLS keys first and save them to blockchain/.env"
  echo "See blockchain/.env.example for the expected format."
  exit 1
fi
source "$BLOCKCHAIN_DIR/.env"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

get_head() {
  curl -sf http://localhost:8000/v1/chain/get_info | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_num'])"
}

get_lib() {
  curl -sf http://localhost:8000/v1/chain/get_info | python3 -c "import sys,json; print(json.load(sys.stdin)['last_irreversible_block_num'])"
}

get_gap() {
  curl -sf http://localhost:8000/v1/chain/get_info | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d['head_block_num'] - d['last_irreversible_block_num'])
"
}

wait_for_block() {
  local old_block
  old_block=$(get_head)
  for i in $(seq 1 30); do
    sleep 2
    local new_block
    new_block=$(get_head 2>/dev/null) || continue
    if [ "$new_block" -gt "$old_block" ]; then
      return 0
    fi
  done
  fail "No new block after 60 seconds"
}

wait_for_blocks() {
  local count="${1:-5}"
  local start_head
  start_head=$(get_head)
  for i in $(seq 1 $((count * 12))); do
    sleep 1
    local current
    current=$(get_head 2>/dev/null) || continue
    if [ "$((current - start_head))" -ge "$count" ]; then
      return 0
    fi
  done
}

# Convert PUB_BLS key to hex
bls_to_hex() {
  python3 "$BLOCKCHAIN_DIR/contracts/setfinalizer/convert_bls_keys.py" "$1"
}

# Wallet management
WALLET_NAME="savanna-tmp-$$"
wallet_created=false

cleanup() {
  if [ "$wallet_created" = true ]; then
    echo "Cleaning up wallet '$WALLET_NAME'..."
    $CLEOS wallet lock -n "$WALLET_NAME" 2>/dev/null || true
    rm -f ~/eosio-wallet/"${WALLET_NAME}".wallet 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Verarta Production Chain: Savanna Finality Activation ==="
echo ""

# ─── Step 1: Verify prerequisites ───
echo "─── Step 1: Verify prerequisites ───"
INFO=$(curl -sf http://localhost:8000/v1/chain/get_info)
echo "$INFO" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'  Chain: {d.get(\"server_version_string\",\"unknown\")}')
print(f'  Head: {d[\"head_block_num\"]}, LIB: {d[\"last_irreversible_block_num\"]}, Gap: {d[\"head_block_num\"] - d[\"last_irreversible_block_num\"]}')
print(f'  Producer: {d[\"head_block_producer\"]}')
"

# Check schedule version >= 1 (multi-producer active) via get_producer_schedule
# Note: get_info doesn't include schedule_version on Spring v1.2.2
SCHEDULE_VER=$(curl -sf -X POST http://localhost:8000/v1/chain/get_producer_schedule -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['active']['version'])")
echo "  Schedule version: $SCHEDULE_VER"
if [ "$SCHEDULE_VER" -lt 1 ]; then
  fail "Multi-producer schedule not active (version $SCHEDULE_VER). Run set-producers.sh first."
fi
ok "Multi-producer schedule active (v$SCHEDULE_VER)"

# Check if SAVANNA feature is activated via get_activated_protocol_features
# Note: get_supported_protocol_features doesn't include activated_at_block on Spring v1.2.2
SAVANNA_DIGEST="cbe0fafc8fcc6cc998395e9b6de6ebd94644467b1b4a97ec126005df07013c52"
SAVANNA_ACTIVE=$(curl -sf -X POST http://localhost:8000/v1/chain/get_activated_protocol_features -d '{"limit":50}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
digests = [f['feature_digest'] for f in d.get('activated_protocol_features', [])]
print('yes' if '$SAVANNA_DIGEST' in digests else 'no')
" 2>/dev/null) || SAVANNA_ACTIVE="unknown"

TOTAL_ACTIVATED=$(curl -sf -X POST http://localhost:8000/v1/chain/get_activated_protocol_features -d '{"limit":50}' | python3 -c "
import sys,json; print(len(json.load(sys.stdin).get('activated_protocol_features', [])))
" 2>/dev/null) || TOTAL_ACTIVATED="?"
echo "  Activated features: $TOTAL_ACTIVATED/23"

if [ "$SAVANNA_ACTIVE" = "yes" ]; then
  ok "SAVANNA protocol feature is activated"
elif [ "$SAVANNA_ACTIVE" = "no" ]; then
  fail "SAVANNA protocol feature not activated. Run activate-features.sh first."
else
  warn "Could not check SAVANNA feature status (will try to proceed)"
fi

# Check if Savanna is already active (LIB gap <= 3)
CURRENT_GAP=$(get_gap)
if [ "$CURRENT_GAP" -le 3 ]; then
  ok "Savanna finality appears to already be active (LIB gap: $CURRENT_GAP)"
  echo "Nothing to do!"
  exit 0
fi

echo ""

# ─── Step 2: Build the setfinalizer contract ───
echo "─── Step 2: Build setfinalizer contract ───"
CONTRACT_DIR="$BLOCKCHAIN_DIR/contracts/setfinalizer"
BUILD_DIR="$CONTRACT_DIR/build"
mkdir -p "$BUILD_DIR"

cdt-cpp -abigen \
  -o "$BUILD_DIR/setfinalizer.wasm" \
  "$CONTRACT_DIR/setfinalizer.cpp" \
  -I"$CONTRACT_DIR" \
  || fail "Failed to build setfinalizer contract"

ok "setfinalizer contract built"
echo ""

# ─── Step 3: Convert BLS public keys to hex ───
echo "─── Step 3: Convert BLS public keys ───"
KEY1_HEX=$(bls_to_hex "$PRODUCER1_BLS_PUBLIC")
KEY2_HEX=$(bls_to_hex "$PRODUCER2_BLS_PUBLIC")
KEY3_HEX=$(bls_to_hex "$PRODUCER3_BLS_PUBLIC")
KEY4_HEX=$(bls_to_hex "$PRODUCER4_BLS_PUBLIC")
echo "  producer1: ${KEY1_HEX:0:16}..."
echo "  producer2: ${KEY2_HEX:0:16}..."
echo "  producer3: ${KEY3_HEX:0:16}..."
echo "  producer4: ${KEY4_HEX:0:16}..."
ok "All 4 BLS keys converted to hex"
echo ""

# ─── Step 4: Setup wallet ───
echo "─── Step 4: Setup wallet ───"
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

# ─── Step 5: Deploy setfinalizer contract to eosio ───
echo "─── Step 5: Deploy setfinalizer contract to eosio ───"
$CLEOS set contract eosio "$BUILD_DIR" setfinalizer.wasm setfinalizer.abi -p eosio@active \
  || fail "Failed to deploy setfinalizer contract to eosio"
ok "setfinalizer contract deployed to eosio"

wait_for_blocks 3
echo ""

# ─── Step 6: Set finalizer policy ───
echo "─── Step 6: Set finalizer policy (threshold=3, 4 finalizers with weight=1) ───"

# Build the JSON payload
POLICY_JSON=$(cat <<ENDJSON
{
  "finalizer_policy": {
    "threshold": 3,
    "finalizers": [
      {
        "description": "producer1",
        "weight": 1,
        "public_key": "$KEY1_HEX"
      },
      {
        "description": "producer2",
        "weight": 1,
        "public_key": "$KEY2_HEX"
      },
      {
        "description": "producer3",
        "weight": 1,
        "public_key": "$KEY3_HEX"
      },
      {
        "description": "producer4",
        "weight": 1,
        "public_key": "$KEY4_HEX"
      }
    ]
  }
}
ENDJSON
)

echo "  Threshold: 3 of 4"
echo "  Finalizers: producer1, producer2, producer3, producer4 (weight=1 each)"
echo ""

$CLEOS push action eosio setfin "$POLICY_JSON" -p eosio@active \
  || fail "Failed to set finalizer policy"
ok "Finalizer policy set!"
echo ""

# ─── Step 7: Wait for Savanna transition ───
echo "─── Step 7: Wait for Savanna transition ───"
echo "The chain needs many blocks to transition from Legacy to Savanna."
echo "With 5s block times and 4 producers, this may take 10-20 minutes."
echo ""

MAX_ROUNDS=60
for round in $(seq 1 $MAX_ROUNDS); do
  wait_for_blocks 5

  GAP=$(get_gap 2>/dev/null) || GAP="?"
  HEAD=$(get_head 2>/dev/null) || HEAD="?"
  LIB=$(get_lib 2>/dev/null) || LIB="?"
  echo "  Round $round/$MAX_ROUNDS — Head: $HEAD, LIB: $LIB, Gap: $GAP"

  if [ "$GAP" != "?" ] && [ "$GAP" -le 5 ]; then
    echo ""
    ok "Savanna finality is ACTIVE! LIB gap: $GAP"
    break
  fi

  if [ "$round" -eq "$MAX_ROUNDS" ]; then
    echo ""
    warn "Reached max rounds. LIB gap: $GAP"
    warn "Savanna may still be transitioning. Monitor the LIB gap manually."
  fi
done
echo ""

# ─── Step 8: Redeploy eosio.boot ───
echo "─── Step 8: Redeploy eosio.boot to eosio ───"
$CLEOS set contract eosio "$BOOT_CONTRACT" -p eosio@active \
  || fail "Failed to redeploy eosio.boot"
ok "eosio.boot restored on eosio"

wait_for_blocks 3
echo ""

# ─── Final verification ───
echo "=== Final Verification ==="
INFO=$(curl -sf http://localhost:8000/v1/chain/get_info)
echo "$INFO" | python3 -c "
import sys,json; d=json.load(sys.stdin)
gap = d['head_block_num'] - d['last_irreversible_block_num']
print(f'  Head: {d[\"head_block_num\"]}, LIB: {d[\"last_irreversible_block_num\"]}, Gap: {gap}')
print(f'  Server: {d.get(\"server_version_string\",\"unknown\")}')
if gap <= 5:
    print('  Status: Savanna instant finality is ACTIVE')
else:
    print(f'  Status: LIB gap still {gap} — may need more blocks')
"

echo ""
echo "Finalizer info:"
curl -sf -X POST http://localhost:8000/v1/chain/get_finalizer_info -d '{}' 2>/dev/null \
  | python3 -m json.tool 2>/dev/null \
  || echo "  (get_finalizer_info endpoint not available on this node)"

echo ""
echo "=== Done ==="
