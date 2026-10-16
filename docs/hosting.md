# Hosting the web app (Netlify)

> Credentia is a hackathon demonstration on Monad Testnet. Hosting it does not make it production ready or audited.

**Status: not deployed.** This page prepares a Netlify deploy; nothing has been published. You do the deploy in your own Netlify account.

## What gets hosted, and what does not
| Part | Hosted by Netlify? |
|---|---|
| Web app (Next.js, the whole credential flow) | Yes |
| Verification | Works with no backend: the browser reads the Monad registry directly |
| Envio indexer / event timeline | **No.** It runs locally in Docker. On a hosted site the timeline panel will show no indexer data (the page still verifies from the chain). Say so honestly on your submission |
| KIMI copilot | Only if `MOONSHOT_API_KEY` is set on Netlify **and** the Moonshot account has credit. Otherwise the page shows "AI summary temporarily unavailable. Onchain verification remains available." |

## Steps (Netlify dashboard)
1. Push the branch to GitHub (done: `feat/credential-flow`), then **Add new site -> Import an existing project -> GitHub** and choose `jenish1345/Credentia`.
2. Branch to deploy: `feat/credential-flow`. **`main` cannot build yet**: it lacks `netlify.toml` and `.npmrc`, so its install fails on a lockfile mismatch. Set the production branch to `feat/credential-flow` (Site configuration -> Build & deploy -> Branches), or merge the branch into `main` first.
3. Build settings are read from the repo's `netlify.toml` (base `web-app`, Node 20, pnpm 9.5.0). Leave the UI fields as detected.
4. **Before the first build**, add the environment variables below (Site configuration -> Environment variables). `NEXT_PUBLIC_*` values are baked in at build time, so changing one needs a new deploy.
5. Deploy. Open the site and check the routes listed at the end.

## Environment variables
Public values (safe to enter as plain values; they end up in the browser bundle anyway):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS` | `0x335de4487bfcc2Aa3D0E68ad67759616DFD25113` |
| `NEXT_PUBLIC_CVI_ORACLE_ADDRESS` | `0x1C825e31a873e227dE77Ec184fd17C25B36508B0` (informational: the app reads the gate from the registry) |
| `NEXT_PUBLIC_MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` (this is the name the app reads) |
| `NEXT_PUBLIC_MONAD_EXPLORER_URL` | `https://testnet.monadvision.com` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional. The current web-app source does not use it (accounts come from Mera passkeys), so you can leave it out |
| `NEXT_PUBLIC_ENVIO_URL` | leave **unset** (the local `http://localhost:8080/...` URL is unreachable from a hosted site) |

Secrets (enter them only in Netlify's UI, mark as secret, **never** commit them):

| Variable | Purpose |
|---|---|
| `MOONSHOT_API_KEY` | KIMI copilot, read only by the server route `/api/copilot`. Optional |
| `KIMI_MODEL` | Optional model ID from your Moonshot console (default `kimi-k3`) |

Never give a secret a `NEXT_PUBLIC_` prefix: that would ship it to every visitor.

## Why `.npmrc` exists
`pnpm-lock.yaml` records `autoInstallPeers: false`. `.npmrc` sets the same value so `pnpm install --frozen-lockfile` (used by the Netlify build) does not fail with a config mismatch.

## After the deploy: what to check
- `/`, `/issue`, `/dashboard`, `/payment-check` return pages.
- Credential 1 shows VERIFIED and credential 2 shows REVOKED (use the share links with `?d=` payloads from your local run, with your site's domain in front).
- View the page source: no key or secret appears.
- Update the README with the live URL and state that the timeline demo is local.

## Vercel instead
Same variables. Set the project root to `web-app`, framework Next.js, and install command `cd .. && pnpm install --frozen-lockfile --filter @credentia/web-app...`.
