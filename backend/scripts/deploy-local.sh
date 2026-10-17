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

cat > "$HERE/../.env.local" <<EOF
MONAD_RPC_URL=$RPC
MONAD_CHAIN_ID=10143
CREDENTIAL_REGISTRY_ADDRESS=$REGISTRY
ISSUER_PRIVATE_KEYS=$ISSUER_KEY
BACKEND_WALLET_PRIVATE_KEY=$RELAYER_KEY
EOF

echo "CredentialRegistry $REGISTRY"
echo "Authorized issuer  $ISSUER"
echo "Wrote backend/.env.local"
