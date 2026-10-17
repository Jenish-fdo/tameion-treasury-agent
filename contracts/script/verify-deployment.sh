#!/usr/bin/env bash
# Read-only checks for a MandateRegistry + DecisionLog deployment. Sends NO transaction and needs no key.
#
#   RPC_URL=https://rpc.testnet.arc.io ./script/verify-deployment.sh <MandateRegistry> <DecisionLog>
#
# Optional environment:
#   EXPECTED_CHAIN_ID  default 5042002 (Arc testnet)
#   EXPECT_EMPTY=0     skip the "fresh deployment, nothing recorded yet" checks (use once the contracts are in use)
#   CHECK_EXPLORER=1   also ask the Blockscout API whether the source is verified (set EXPLORER_API, default Arc testnet)
#   CAST               the cast binary to use (default: cast; use arc-cast with Arc Foundry)
set -uo pipefail

REGISTRY="${1:-}"; LOG="${2:-}"
RPC_URL="${RPC_URL:?set RPC_URL}"
CAST="${CAST:-cast}"
EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-5042002}"
EXPECT_EMPTY="${EXPECT_EMPTY:-1}"
EXPLORER_API="${EXPLORER_API:-https://explorer.testnet.arc.io/api/}"
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000
fails=0

if ! [[ "$REGISTRY" =~ ^0x[0-9a-fA-F]{40}$ && "$LOG" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "usage: RPC_URL=... $0 <MandateRegistry address> <DecisionLog address>" >&2; exit 2
fi

ok()  { printf '  PASS  %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
call() { "$CAST" call "$1" "$2" --rpc-url "$RPC_URL" 2>/dev/null; }          # prints the first value; non-zero exit on revert
# `cast call` prints "123 [1.23e2]" for numbers: keep the first token
first() { awk '{print $1}'; }
expect() { # <label> <actual> <expected>
  if [ "$(lower "$2")" = "$(lower "$3")" ]; then ok "$1 = $3"; else bad "$1: expected $3, got '${2:-<empty>}'"; fi
}

echo "Chain"
CHAIN=$("$CAST" chain-id --rpc-url "$RPC_URL" 2>/dev/null || true)
expect "chain id" "$CHAIN" "$EXPECTED_CHAIN_ID"

echo "Code"
for pair in "MandateRegistry:$REGISTRY" "DecisionLog:$LOG"; do
  name=${pair%%:*}; addr=${pair#*:}
  code=$("$CAST" code "$addr" --rpc-url "$RPC_URL" 2>/dev/null || true)
  bytes=$(( (${#code} - 2) / 2 ))
  if [ "${#code}" -gt 2 ] && [ "$bytes" -lt 24576 ]; then ok "$name has $bytes bytes of runtime code (limit 24,576)"; else bad "$name has no code, or too much ($bytes bytes) at $addr"; fi
done

echo "Wiring"
expect "DecisionLog.registry()" "$(call "$LOG" 'registry()(address)')" "$REGISTRY"
DOMAIN=$("$CAST" call "$REGISTRY" 'eip712Domain()(bytes1,string,string,uint256,address,bytes32,uint256[])' --rpc-url "$RPC_URL" 2>/dev/null || true)
expect "EIP-712 domain name" "$(printf '%s\n' "$DOMAIN" | sed -n 2p | tr -d '"')" "Credentia Mandates"
expect "EIP-712 domain version" "$(printf '%s\n' "$DOMAIN" | sed -n 3p | tr -d '"')" "1"
expect "EIP-712 domain chainId" "$(printf '%s\n' "$DOMAIN" | sed -n 4p | first)" "$EXPECTED_CHAIN_ID"
expect "EIP-712 verifyingContract" "$(printf '%s\n' "$DOMAIN" | sed -n 5p)" "$REGISTRY"

echo "Constants (match PHASE3_PLAN.md)"
expect "MAX_MANDATE_DURATION" "$(call "$REGISTRY" 'MAX_MANDATE_DURATION()(uint64)' | first)" "31536000"
expect "MAX_INITIAL_RECIPIENTS" "$(call "$REGISTRY" 'MAX_INITIAL_RECIPIENTS()(uint256)' | first)" "100"
expect "MAX_ALLOWED_RISK_TIER" "$(call "$REGISTRY" 'MAX_ALLOWED_RISK_TIER()(uint8)' | first)" "2"
expect "DecisionLog MAX_PAGE" "$(call "$LOG" 'MAX_PAGE()(uint256)' | first)" "50"

echo "No admin surface (each of these must NOT exist)"
for sig in 'owner()(address)' 'pendingOwner()(address)' 'paused()(bool)' 'implementation()(address)' 'admin()(address)'; do
  for pair in "MandateRegistry:$REGISTRY" "DecisionLog:$LOG"; do
    name=${pair%%:*}; addr=${pair#*:}
    if call "$addr" "$sig" >/dev/null; then bad "$name answers ${sig%%(*}()"; else ok "$name has no ${sig%%(*}()"; fi
  done
done

if [ "$EXPECT_EMPTY" = "1" ]; then
  echo "Fresh deployment (nothing recorded yet)"
  c=$("$CAST" call "$REGISTRY" 'mandateCountByBusiness(bytes32)(uint256)' "$ZERO32" --rpc-url "$RPC_URL" 2>/dev/null | first)
  expect "mandates for the zero business" "$c" "0"
  d=$("$CAST" call "$LOG" 'countByBusiness(bytes32)(uint256)' "$ZERO32" --rpc-url "$RPC_URL" 2>/dev/null | first)
  expect "decisions for the zero business" "$d" "0"
fi

if [ "${CHECK_EXPLORER:-0}" = "1" ]; then
  echo "Explorer source verification (Blockscout API, read-only)"
  for pair in "MandateRegistry:$REGISTRY" "DecisionLog:$LOG"; do
    name=${pair%%:*}; addr=${pair#*:}
    abi=$(curl -fsS "${EXPLORER_API}?module=contract&action=getsourcecode&address=$addr" 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result"); r=r[0] if isinstance(r,list) and r else {}; print("verified" if r.get("SourceCode") and r.get("ContractName")=="'"$name"'" else "not-verified")' 2>/dev/null || echo "unreachable")
    expect "$name source on the explorer" "$abi" "verified"
  done
fi

echo
if [ "$fails" -eq 0 ]; then echo "ALL CHECKS PASSED"; exit 0; else echo "$fails CHECK(S) FAILED"; exit 1; fi
