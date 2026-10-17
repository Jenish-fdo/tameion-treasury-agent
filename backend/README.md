# Credentia backend

Express + TypeScript API for Credentia Treasury Autopsy. Early build: it currently serves credential minting and verification against the on-chain registry, and a multi-model payment risk verdict.

## Run

```bash
cp .env.example .env     # API_KEYS is required and has no default: openssl rand -hex 32
pnpm dev                 # http://localhost:3001, API under /api/v1
pnpm test                # unit and integration tests (no network)
pnpm test:e2e            # needs a local chain, see below
pnpm typecheck
```

## Endpoints (`/api/v1`)

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness |
| `POST /credential/mint` | API key | sign a credential as a managed issuer and submit `issueCredentialWithSig` through the relayer |
| `GET /credential/:credentialId/verify` | API key | read a credential's validity from the registry |
| `POST /intent/evaluate` | API key | ask the configured models whether a payment should proceed (`GO` / `STOP` / `REVIEW`) |

The full contract is `docs/api.yaml`. Auth is an API key in `X-API-Key` or `Authorization: Bearer`; the server refuses to start without keys. Rate limits are per key, with a much lower hourly limit on `/intent/evaluate` because it calls paid models.

## Configuration

See `.env.example`. Notable variables:

- `ARC_NETWORK` (`testnet` default or `mainnet`) selects the default RPC, chain ID and explorer; `ARC_RPC_URL`, `ARC_CHAIN_ID`, `ARC_EXPLORER_URL` override them (for example for a local node).
- `CREDENTIAL_REGISTRY_ADDRESS`, `ISSUER_PRIVATE_KEYS`, `BACKEND_WALLET_PRIVATE_KEY`: the registry and the keys used to sign and pay for minting. Keep the keys secret; they are being replaced by Circle wallets.
- `KIMI_*`, `QWEN_*`, `JEV_*`: three OpenAI-compatible model endpoints. A model without a key reports `not_configured`; at least two must answer for a verdict.
- `DATA_DIR`: where off-chain credential metadata is stored (a JSON file for now).

## End-to-end tests

They run against a local Anvil chain using Arc's testnet chain ID and a freshly deployed registry:

```bash
anvil --chain-id 5042002 &
./scripts/deploy-local.sh      # writes backend/.env.local with Anvil's public test keys
pnpm test:e2e
```

`deploy-local.sh` overwrites `backend/.env.local`; back it up first if it holds anything you want to keep.

## Layout

```
src/chain/        Arc constants, viem clients, ABIs
src/config/       zod-validated environment, model configuration
src/services/     credentialService, aiConsensusService, intentService
src/store/        credential metadata store (file-backed)
src/middleware/   auth, rate limits, errors, request logging
src/prompts/      the payment-risk system prompt
```
