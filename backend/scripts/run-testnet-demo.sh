#!/usr/bin/env bash
# ARC TESTNET ONLY. Starts the API with backend/.env.arc-testnet (made by contracts/script/arc-testnet-bootstrap.sh), runs
# scripts/demo-run.mjs against it, then stops the API it started (by PID, never by name). Keys are read from the env file by
# the API process and are not printed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$HERE/.." && pwd)"
ENV_FILE="$BACKEND/.env.arc-testnet"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Run contracts/script/arc-testnet-bootstrap.sh first."; exit 1; }

PORT="${DEMO_PORT:-3099}"
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $PORT is in use; set DEMO_PORT to a free port."; exit 1; fi

LOG="$(mktemp -t credentia-api-XXXXXX)"
DATA="$(mktemp -d -t credentia-data-XXXXXX)"
cd "$BACKEND"
( set -a; . "$ENV_FILE"; set +a; PORT="$PORT" LOG_LEVEL=error DATA_DIR="$DATA" exec ./node_modules/.bin/tsx src/index.ts >"$LOG" 2>&1 ) &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://localhost:$PORT/api/v1/businesses/owners" && break
  kill -0 "$API_PID" 2>/dev/null || { echo "API exited early. Log: $LOG"; exit 1; }
  sleep 1
done

API_KEY="$(grep '^API_KEYS=' "$ENV_FILE" | cut -d= -f2 | cut -d, -f1)"
API_BASE="http://localhost:$PORT/api/v1" API_KEY="$API_KEY" node "$HERE/demo-run.mjs"
