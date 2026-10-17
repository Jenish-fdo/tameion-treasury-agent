# Hosting the web app (Netlify)

> Credentia Treasury Autopsy is an early build on Arc testnet. Hosting it does not make it production ready or audited.

**Status: not deployed.** This page prepares a Netlify deploy; nothing has been published. You do the deploy in your own Netlify account.

## What gets hosted, and what does not
| Part | Hosted by Netlify? |
|---|---|
| Web app (Next.js) | Yes |
| Verification | Works with no backend: the browser reads the Arc registry directly |
| Backend API (`backend/`) | No. Host it separately (any Node 20 host) and point `CREDENTIA_API_URL` at it |
| Copilot | Only if `MOONSHOT_API_KEY` is set and the account has credit. Otherwise the page shows that the AI summary is unavailable and on-chain verification still works |

## Steps (Netlify dashboard)
1. Push the repo to GitHub, then **Add new site -> Import an existing project -> GitHub**.
2. Build settings are read from `netlify.toml` (base `web-app`, Node 20, pnpm 9.5.0). Leave the UI fields as detected.
3. **Before the first build**, add the environment variables below. `NEXT_PUBLIC_*` values are baked in at build time, so changing one needs a new deploy.
4. Deploy, then check the routes listed at the end.

## Environment variables
Public values (they end up in the browser bundle):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_ARC_NETWORK` | `testnet` (default) or `mainnet` |
| `NEXT_PUBLIC_ARC_RPC_URL` | Optional override of the network's default RPC |
| `NEXT_PUBLIC_ARC_EXPLORER_URL` | Optional override of the network's default explorer |
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS` | Address of the registry you deployed on Arc. Empty = demo mode (nothing is anchored) |
| `NEXT_PUBLIC_ENVIO_URL` | Leave **unset**: the indexer was removed and the history panels degrade gracefully |

Secrets (enter them only in Netlify's UI, mark as secret, **never** commit them):

| Variable | Purpose |
|---|---|
| `CREDENTIA_API_URL` / `CREDENTIA_API_KEY` | Server-side proxy to the backend for the payment check (`/api/payment-check`) |
| `MOONSHOT_API_KEY` | Copilot, read only by the server route `/api/copilot`. Optional |
| `KIMI_MODEL` | Optional model ID from your Moonshot console |

Never give a secret a `NEXT_PUBLIC_` prefix: that would ship it to every visitor.

## Why `.npmrc` exists
`pnpm-lock.yaml` records `autoInstallPeers: false`. `.npmrc` sets the same value so `pnpm install --frozen-lockfile` does not fail with a config mismatch.

## After the deploy: what to check
- `/`, `/issue`, `/dashboard`, `/payment-check` return pages.
- View the page source: no key or secret appears.
- Account sign-in is a placeholder for now (see `web-app/src/components/account.tsx`), so on-chain issuing is unavailable; demo mode works.

## Vercel instead
Same variables. Set the project root to `web-app`, framework Next.js, and install command `cd .. && pnpm install --frozen-lockfile --filter @credentia/web-app...`.
