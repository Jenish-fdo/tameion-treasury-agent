#!/usr/bin/env bash
# Deploys the Credentia contracts to a local Anvil node and writes the addresses to
# backend/.env.local (load it with: set -a; . .env.local; set +a). Local development only: the keys below are
# Anvil's public, well-known test keys and must never be used on a real network.
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS="$HERE/../../contracts"

DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ISSUER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ISSUER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
RELAYER_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a # Anvil account 4 (pays gas)

cd "$CONTRACTS"

create() { # <contract path:name> [constructor args...]
  local target="$1"; shift
  if [ "$#" -gt 0 ]; then
    forge create "$target" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --json --constructor-args "$@"
  else
    forge create "$target" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --json
  fi | python3 -c 'import json,sys; print(json.load(sys.stdin)["deployedTo"])'
}

REGISTRY=$(create src/CredentialRegistry.sol:CredentialRegistry "Credentia" "1" "$DEPLOYER")
cast send "$REGISTRY" "authorizeIssuer(address)" "$ISSUER" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null

# A demo business owner with a FRESH random key (nothing about it is stored in the repo), funded from the deployer.
OWNER_JSON=$(cast wallet new --json)
# (forge versions differ: the JSON is a bare object, a list of one, or wrapped as {"data": [...]})
owner_field() { printf '%s' "$OWNER_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); d=d.get("data", d) if isinstance(d,dict) else d; d=d[0] if isinstance(d,list) else d; print(d[sys.argv[1]])' "$1"; }
OWNER_KEY=$(owner_field private_key)
OWNER_ADDRESS=$(owner_field address)
cast send "$OWNER_ADDRESS" --value 100ether --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null

MANDATES=$(create src/MandateRegistry.sol:MandateRegistry)
DECISIONS=$(create src/DecisionLog.sol:DecisionLog "$MANDATES")

cat > "$HERE/../.env.local" <<EOF
ARC_RPC_URL=$RPC
ARC_CHAIN_ID=5042002
CREDENTIAL_REGISTRY_ADDRESS=$REGISTRY
ISSUER_PRIVATE_KEYS=$ISSUER_KEY
BACKEND_WALLET_PRIVATE_KEY=$RELAYER_KEY
MANDATE_REGISTRY_ADDRESS=$MANDATES
DECISION_LOG_ADDRESS=$DECISIONS
BUSINESS_OWNER_PRIVATE_KEYS=$OWNER_KEY
DEMO_OWNER_ADDRESS=$OWNER_ADDRESS
EOF

echo "CredentialRegistry $REGISTRY"
echo "MandateRegistry    $MANDATES"
echo "DecisionLog        $DECISIONS"
echo "Demo owner         $OWNER_ADDRESS (random key, written to backend/.env.local)"
echo "Authorized issuer  $ISSUER"
echo "Wrote backend/.env.local"
