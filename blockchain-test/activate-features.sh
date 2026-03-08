#!/bin/bash
# Activate all 23 protocol features on the Verarta test chain.
# Run this on the server where cleos and the nodeos containers are accessible.
set -euo pipefail

CLEOS="cleos -u http://localhost:18000 --wallet-url http://localhost:16666"
BOOT_CONTRACT="/opt/verarta/app/blockchain/contracts/reference-contracts/build/contracts/eosio.boot"
PACE_URL="http://localhost:13100"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

wait_for_block() {
  echo "Waiting for a new block..."
  local old_block
  old_block=$(curl -sf http://localhost:18000/v1/chain/get_info | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_num'])")
  # Signal activity to pace controller so it produces blocks faster
  curl -sf -X POST "$PACE_URL/activity" > /dev/null 2>&1 || true
  for i in $(seq 1 60); do
    sleep 2
    curl -sf -X POST "$PACE_URL/activity" > /dev/null 2>&1 || true
    local new_block
    new_block=$(curl -sf http://localhost:18000/v1/chain/get_info | python3 -c "import sys,json; print(json.load(sys.stdin)['head_block_num'])" 2>/dev/null) || continue
    if [ "$new_block" -gt "$old_block" ]; then
      ok "New block produced: $new_block"
      return 0
    fi
  done
  fail "No new block after 120 seconds"
}

activate_feature() {
  local digest="$1"
  local name="$2"
  local result
  result=$($CLEOS push action eosio activate "[\"$digest\"]" -p eosio@active 2>&1) || {
    if echo "$result" | grep -qi "already activated"; then
      ok "$name already activated"
      return 0
    fi
    echo "$result"
    fail "Failed to activate $name"
  }
  ok "Activated $name"
}

count_activated() {
  curl -sf -X POST http://localhost:18000/v1/producer/get_supported_protocol_features \
    -d '{"exclude_disabled":false,"exclude_unactivatable":false}' | \
    python3 -c "import sys,json; fs=json.load(sys.stdin); a=sum(1 for f in fs if f.get('activated_at_block')); print(f'{a}/{len(fs)} features activated')"
}

echo "=== Verarta Test Chain: Protocol Feature Activation ==="
echo ""
echo "Current status: $(count_activated)"
echo ""

# ─── Step 1: Activate PREACTIVATE_FEATURE via producer API ───
echo "─── Step 1: Activate PREACTIVATE_FEATURE on all producer nodes ───"
PREACTIVATE="0ec7e080177b2c02b278d5088611686b49d739925a92d9bfcacd7fc6b74053bd"
for port in 18000 18001 18002 18003; do
  result=$(curl -sf -X POST "http://localhost:$port/v1/producer/schedule_protocol_feature_activations" \
    -d "{\"protocol_features_to_activate\":[\"$PREACTIVATE\"]}" 2>&1) || true
  echo "  Producer :$port -> $result"
done
ok "PREACTIVATE_FEATURE scheduled on all producers"

# Signal activity to pace controller so it produces blocks
curl -sf -X POST "$PACE_URL/activity" > /dev/null 2>&1 || true
wait_for_block
sleep 2
curl -sf -X POST "$PACE_URL/activity" > /dev/null 2>&1 || true
wait_for_block

echo ""
echo "Status after PREACTIVATE: $(count_activated)"
echo ""

# ─── Step 2: Deploy eosio.boot to eosio ───
echo "─── Step 2: Deploy eosio.boot contract to eosio ───"
$CLEOS set contract eosio "$BOOT_CONTRACT" || fail "Failed to deploy eosio.boot"
ok "eosio.boot deployed"
echo ""

# ─── Step 3: Activate all features except SAVANNA ───
echo "─── Step 3: Activate dependency features (21 features) ───"

# Group A: No-dependency features (19 features)
# These can be activated in any order.
activate_feature "fce57d2331667353a0eac6b4209b67b843a7262a848af0a49a6e2fa9f6584eb4" "DISABLE_DEFERRED_TRXS_STAGE_1"
activate_feature "1a99a59d87e06e09ec5b028a9cbb7749b4a5ad8819004365d02dc4379a8b7241" "ONLY_LINK_TO_EXISTING_PERMISSION"
activate_feature "2652f5f96006294109b3dd0bbde63693f55324af452b799ee137a81a905eed25" "FORWARD_SETCODE"
activate_feature "299dcb6af692324b899b39f16d5a530a33062804e41f09dc97e9f156b4476707" "WTMSIG_BLOCK_SIGNATURES"
activate_feature "35c2186cc36f7bb4aeaf4487b36e57039ccf45a9136aa856a5d569ecca55ef2b" "GET_BLOCK_NUM"
activate_feature "ef43112c6543b88db2283a2e077278c315ae2c84719a8b25f25cc88565fbea99" "NO_DUPLICATE_DEFERRED_ID"
activate_feature "4e7bf348da00a945489b2a681749eb56f5de00b900014e137ddae39f48f69d67" "RAM_RESTRICTIONS"
activate_feature "4fca8bd82bbd181e714e283f83e1b45d95ca5af40fb89ad3977b653c448f78c2" "WEBAUTHN_KEY"
activate_feature "5443fcf88330c586bc0e5f3dee10e7f63c76c00249c87fe4fbf7f38c082006b4" "BLOCKCHAIN_PARAMETERS"
activate_feature "63320dd4a58212e4d32d1f58926b73ca33a247326c2a5e9fd39268d2384e011a" "BLS_PRIMITIVES2"
activate_feature "68dcaa34c0517d19666e6b33add67351d8c5f69e999ca1e37931bc410a297428" "DISALLOW_EMPTY_PRODUCER_SCHEDULE"
activate_feature "6bcb40a24e49c26d0a60513b6aeb8551d264e4717f306b81a37a5afb3b47cedc" "CRYPTO_PRIMITIVES"
activate_feature "8ba52fe7a3956c5cd3a656a3174b931d3bb2abb45578befc59f283ecd816a405" "ONLY_BILL_FIRST_AUTHORIZER"
activate_feature "ad9e3d8f650687709fd68f4b90b41f7d825a365b02c23a636cef88ac2ac00c43" "RESTRICT_ACTION_TO_SELF"
activate_feature "bcd2a26394b36614fd4894241d3c451ab0f6fd110958c3423073621a70826e99" "GET_CODE_HASH"
activate_feature "c3a6138c5061cf291310887c0b5c71fcaffeab90d5deb50d3b9e687cead45071" "ACTION_RETURN_VALUE"
activate_feature "d528b9f6e9693f45ed277af93474fd473ce7d831dae2180cca35d907bd10cb40" "CONFIGURABLE_WASM_LIMITS2"
activate_feature "e0fb64b1085cc5538970158d05a009c24e276fb94e1a0bf6a528b48fbc4ff526" "FIX_LINKAUTH_RESTRICTION"
activate_feature "f0af56d2c5a48d60a4a5b5c903edfb7db3a736a94ed589d0b797df33ff9d3e1d" "GET_SENDER"

# Wait for a block so Group A features become fully activated (not just pre-activated)
echo "Waiting for Group A features to finalize..."
wait_for_block

# Group B: Features with dependencies (must come after their deps are finalized)
# REPLACE_DEFERRED depends on NO_DUPLICATE_DEFERRED_ID
activate_feature "4a90c00d55454dc5b059055ca213579c6ea856967712a56017487886a4d4cc0f" "REPLACE_DEFERRED"
# DISABLE_DEFERRED_TRXS_STAGE_2 depends on DISABLE_DEFERRED_TRXS_STAGE_1
activate_feature "09e86cb0accf8d81c9e85d34bea4b925ae936626d00c984e4691186891f5bc16" "DISABLE_DEFERRED_TRXS_STAGE_2"

echo ""
echo "Status after Step 3: $(count_activated)"
echo ""

# ─── Step 4: Activate SAVANNA ───
echo "─── Step 4: Activate SAVANNA ───"
wait_for_block
activate_feature "cbe0fafc8fcc6cc998395e9b6de6ebd94644467b1b4a97ec126005df07013c52" "SAVANNA"

echo ""
echo "=== Final status: $(count_activated) ==="
echo ""
echo "Note: SAVANNA feature is activated but finality mode is NOT switched."
echo "Switching to Savanna finality requires setting a finalizer policy with BLS keys (separate effort)."
