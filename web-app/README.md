# Credentia web app

Next.js 14 (App Router) front end for Credentia Treasury Autopsy. Early build: it carries the record layer (issue, share, verify, receipt) and a payment-risk check. The treasury screens come in Phase 6 of `CLEANUP_PLAN.md`.

## Run

```bash
cp .env.example .env.local
pnpm dev          # http://localhost:3000
pnpm test         # jest, no network
pnpm typecheck
pnpm build
```

## Routes

| Route | What it does |
|---|---|
| `/` | landing |
| `/issue` | issue a record (demo mode unless a registry address is configured) |
| `/verify/[id]` | public verification page; needs no account |
| `/receipt/[id]` | receipt for a record |
| `/dashboard` | records issued from this browser (kept in `localStorage`) |
| `/payment-check` | multi-model payment risk verdict through the backend |
| `/api/payment-check`, `/api/copilot` | server routes that keep the backend API key and model key off the browser |

## How a record works

A record's **fingerprint** (`keccak256` of title, recipient name, description and a random salt) is written to `CredentialRegistry.issueCredential(holder, keccak256(title), fingerprint, expiry)`. The share link `/verify/<id>?d=<payload>` carries the readable details; the verifier's browser recomputes the fingerprint and ID and compares them with the registry, so edited details show as `DETAILS DO NOT MATCH`. Do not put sensitive personal data in the link.

Statuses: `VERIFIED`, `PENDING`, `REVOKED`, `EXPIRED`, `NOT FOUND`, `DETAILS DO NOT MATCH`, `CANNOT CHECK` (registry unreachable), `DEMO · NOT ANCHORED`.

**Demo mode:** with `NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS` empty, `/issue` creates clearly labelled demo records that never touch a chain and can never show as verified.

## Accounts

`src/components/account.tsx` is a temporary signed-out stub. Mera passkey accounts were removed; the real account layer arrives with Circle wallets. Until then nothing can sign in the browser, so on-chain issuing and on-chain verification receipts are unavailable and demo mode is the working path.

## Arc network

`src/lib/arc.ts` is the single source for the chain, RPC, explorer and USDC constants. Choose the network with `NEXT_PUBLIC_ARC_NETWORK` (`testnet` default, or `mainnet`); `NEXT_PUBLIC_ARC_RPC_URL` and `NEXT_PUBLIC_ARC_EXPLORER_URL` override the defaults. USDC is the native gas token (18 decimals natively, 6 through its ERC-20 interface).

## Environment

See `.env.example`. Anything prefixed `NEXT_PUBLIC_` is shipped to every visitor: never put a secret there. `CREDENTIA_API_KEY` and `MOONSHOT_API_KEY` are server-only.
