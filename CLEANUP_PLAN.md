# CLEANUP_PLAN.md — Credentia → Credentia Treasury Autopsy

Status: **read-only audit. No code, config, or file was changed except creating this document.**
Audit date: 2026-10-16. Scope: everything under the repo root except `node_modules/`, `contracts/lib/` internals, and binary media (mp4/wav/png/jpg were listed but not read).

How the Monad/Metropolis search was done: a case-insensitive text scan (`monad|metropolis`) over ~350 text files (`.ts .tsx .sol .md .json .yaml .toml .py .mjs .sh .txt .srt .css …`). Counts below are approximate line-match counts. A few files timed out in the first pass and were re-scanned or read directly; if you want a guaranteed-complete list, re-run the scan after Phase 0 on a quiet machine.

---

## 0. Things you should know before touching anything

1. **The repo has no commits.** `git status` reports "No commits yet" and everything is untracked. Deleting files now is irreversible. Phase 0 below makes a snapshot commit/tag first.
2. **Secrets exist on disk.** `backend/.env.local` has `ISSUER_PRIVATE_KEYS`, `BACKEND_WALLET_PRIVATE_KEY`, and `MOONSHOT_API_KEY` keys; `backend/.env` has `KIMI_API_KEY`, `QWEN_API_KEY`, `MOONSHOT_API_KEY`, `API_KEY`; `web-app/.env.local` and `contracts/.env` also exist. I listed key *names only* and did not read values. `.gitignore` (`.env`, `.env.*`, `!.env.example`) covers them, and since nothing is committed nothing has leaked into history. If any key was ever used with real funds or a paid account, rotate it before the repo is shared or pushed. The root `.gitignore` does **not** list `out/`, `cache/`, `broadcast/`, `.next/`, `.netlify/`, `*.tsbuildinfo`, `data/`, or `*.mp4`. Per-package `.gitignore` files exist in `web-app/`, `backend/`, `contracts/` and may already cover some of these (I did not read them) — verify with `git status --ignored` before the first commit.
3. **`backend/.env.local` points at a local Anvil chain** (`CREDENTIAL_REGISTRY_ADDRESS=0x5FbDB…0aa3`, `TRUST_SCORE_ADDRESS=0xe7f17…0512` are Anvil's default deploy addresses), while `web-app/.env.local` points at the real Monad testnet deployment. Two different environments are mixed.
4. **Unused/placeholder scaffolding is mixed in with the real code** (Prisma schema with no Prisma dependency, stubbed identity controller, 40-line root `.env.example` of variables nothing reads, docs index linking to ~25 files that don't exist). Section 5 lists these.
5. Tests were **not run** in this audit (read-only). Inventory is in §1.7.

---

## 1. Current architecture summary

### 1.1 What Credentia is today
A hackathon product (Monad Metropolis) combining two things:
- **Credential flow** (the polished part): issue → share → verify → receipt. An issuer signs a credential with a Mera passkey in the browser; only a fingerprint hash is anchored on-chain in `CredentialRegistry`; a share link carries the readable details; the verifier recomputes the hash and compares.
- **Payment-risk flow** (second core): `/payment-check` asks three LLMs (Kimi, Qwen, "Jev") whether a payment should proceed, takes a weighted vote → `GO / STOP / REVIEW`.
- Scaffolding for a larger "identity + trust + staking" vision (DID registry, trust score, staking pool) that is only partly wired.

### 1.2 Monorepo layout (pnpm workspace: `contracts`, `backend`, `web-app`, `mobile-sdk`, `metamask-snap`; `indexer` is *not* in the workspace and uses npm)

| Dir | Stack | What it does |
|---|---|---|
| `contracts/` | Foundry, Solidity ^0.8.20, OpenZeppelin v5 (vendored in `lib/`, no `.gitmodules`) | 6 contracts + interfaces, 3 scripts, 6 test files (~4.5k LOC incl. tests) |
| `backend/` | Node 20, Express 4, viem, zod, winston, ESM/TS, Jest | REST API under `/api/v1`, API-key auth + rate limiting, AI consensus, credential minting via relayer |
| `web-app/` | Next.js 14 App Router, Tailwind, viem, zustand, react-query, `@category-labs/mera` passkeys | Credential issue/verify/receipt UI, payment-check UI, copilot route |
| `indexer/` | Envio HyperIndex v3 | Indexes registry + CVI oracle events on Monad testnet (chain 10143) |
| `metamask-snap/` | MetaMask Snap (tx-insight) | Shows trust signals about recipient before signing |
| `mobile-sdk/` | React Native SDK + example app | Trust-score badge, credential list, unsigned `issueCredential` tx builder |
| `docs/` | Markdown | Mix of real docs (architecture, hosting, ai-consensus, security-review) and an index that links to non-existent pages |
| `demo-production/`, `submission-package/` | Python/ffmpeg scripts, mp4/wav/srt/png | Hackathon demo videos, pitch, submission text (~160 MB of media; whole repo is 1.7 GB incl. `node_modules`) |

### 1.3 Smart contracts (`contracts/src`)
| Contract | LOC | Purpose | Verdict for new product |
|---|---|---|---|
| `CredentialRegistry.sol` | 448 | EIP-712 signed issuance (`issueCredentialWithSig`), direct issue, revoke, expiry, issuer allow-list (owner), per-holder nonces, `recordVerification` receipts, optional "CVI gate", "high assurance" path. Credential ID = `keccak256(issuer, holder, type, dataHash)` | **Core to keep** → becomes the mandate/decision registry (see §4) |
| `CviAttestationOracle.sol` | 126 | Self-declared **stand-in** for Cleanverse Verified Identity (README says explicitly it is *not* a real Cleanverse integration) | Delete (hackathon-sponsor shim) |
| `IdentityRegistry.sol` | 168 | DID register/update/deactivate; AI-agent flag | Delete (backend controller for it is an unimplemented stub). Revisit only if agent identity registry is wanted on Arc |
| `TrustScore.sol` | 417 | Weighted score (credential 40 / attestation 35 / staking 25) from trusted sources | Delete or rewrite as vendor-risk record; current factors don't map to treasury |
| `StakingPool.sol` | 496 | Stake AUSD, trust-boosted rewards, slashing. `AUSD` address is a **placeholder** (`0x…012a`) per `docs/architecture.md` | Delete (Monad AUSD-specific, off-product) |
| `Counter.sol` | 14 | Foundry boilerplate | Delete |
| `interfaces/` | | `ICredentialRegistry`, `ICviVerifier`, `IStakingPool`, `ITrustScore` | Keep `ICredentialRegistry` (refactor); delete the rest |

Scripts: `Deploy.s.sol` (deploys only `IdentityRegistry`, rest are `TODO` comments, uses `DEPLOYER_PRIVATE_KEY` from env); `DeployCredentialFlow.s.sol` (real: registry + oracle + CVI gate, keystore signer, `--rpc-url monad_testnet`); `Counter.s.sol` (boilerplate).
`foundry.toml`: `chain_id = 10143`, `rpc_endpoints.monad_testnet = ${MONAD_TESTNET_RPC}`, `auto_detect_solc`, optimizer 200 runs. (`docs/architecture.md` claims `solc_version = "0.8.20"` is pinned — the file does not do that; docs are stale.)
Build artifacts committed to the tree: `contracts/out/`, `cache/`, `broadcast/DeployCredentialFlow.s.sol/10143/*` (contains the real Monad testnet deploy txs).

### 1.4 Backend (`backend/src`)
Express app (`app.ts`): helmet, CORS, 100 kb JSON limit, public `GET /api/v1/health`, then API-key auth (`x-api-key`) + per-key rate limits (free 100/min, pro 1000/min; `/intent/evaluate` limited to 10/100 per hour because it fans out to paid LLMs). Fails closed if no API keys are configured.

Routes: `/api/v1/identities/*` (**stub — every handler is a TODO returning fake data**), `/api/v1/intent/evaluate`, `POST /credential/mint`, `GET /credential/:id/verify`, `GET /trust-score/:address`, `GET /agent/:address/credentials`.

Key modules:
- `services/aiConsensusService.ts` — **high-quality, reusable**: 3 OpenAI-compatible providers in parallel, per-attempt timeout, exponential retry, strict JSON-answer schema, weighted vote, ≥2-of-3 quorum, prompt-injection detection that downgrades GO→REVIEW, 5-min cache by intent hash with in-flight de-duplication, DI for tests.
- `services/credentialService.ts` — EIP-712 `issueCredentialWithSig` via a relayer wallet, mutex-serialised nonces, simulate-then-write, receipt wait with "pending" fallback, off-chain metadata only served if it re-hashes to the on-chain `dataHash`.
- `store/credentialStore.ts` — file-backed JSON store (atomic temp-file+rename). Comment says "swap for Prisma/Postgres by implementing this interface".
- `chain/clients.ts` — viem clients hard-coded to **"Monad Testnet"**, `MON` currency, Monad explorer URL, 500 ms polling "because Monad blocks are ~400 ms".
- `utils/promptSanitizer.ts`, `promptBuilder.ts`, `intentHash.ts`, `modelCache.ts`, `logger.ts`, `lib/mutex.ts`, `middleware/*` — chain-agnostic, reusable.
- `prompts/paymentIntent.txt` — payment-risk system prompt (good injection-resistance wording; "tokens in smallest unit" – generic).
- `prisma/schema.prisma` — `Identity / Attestation / Credential / TrustScore` models. **`@prisma/client`/`prisma` are not in `package.json`; nothing imports Prisma.** Dead schema.
- Config: zod-validated env (`config/index.ts`) with `MONAD_RPC_URL`, `MONAD_CHAIN_ID`, `CREDENTIAL_REGISTRY_ADDRESS`, `TRUST_SCORE_ADDRESS`, `ISSUER_PRIVATE_KEYS`, `BACKEND_WALLET_PRIVATE_KEY`, `KIMI_*`, `QWEN_*`, `JEV_*`.

### 1.5 Web app (`web-app/src`)
Routes (`app/`): `/` landing · `/issue` · `/verify/[id]` · `/receipt/[id]` · `/dashboard` (credentials issued from this browser, `localStorage`) · `/payment-check` · `/payment-story` · `/trust-dashboard` · `/credential/create` · `/credential/verify/[id]` · API: `/api/payment-check` (server proxy that keeps the backend API key off the client), `/api/copilot` (Kimi tool-calling loop), `/api/credential/[id]`, `/api/trust-score/[address]`, `/api/agent-credentials/[address]`.
Component families: `components/dc/*` (the polished credential UI: Landing, IssueForm, VerifyView, ReceiptView, DashboardView, CredentialCard, StatusBadge, ShareBlock, RecordCheck, IssuerRecord, InsightPanel, Copilot, PasskeyButton, CviBadge, ScrollStory, SmoothScroll, motion, CheckList, DcChrome), `components/evidence/*` and `components/story/*` (payment "case file" storytelling), `components/home/*` (older hero/features), `components/dashboard/*` (older trust dossier/tables), `PaymentIntentForm`, `ConsensusResultCard`, `ModelVerdictCard`, `account.tsx`, `providers.tsx`, layout header/footer.
Libs: `lib/monad.ts` (chain def, faucet), `lib/chain.ts` (explorer + registry address), `lib/mera.ts` (passkey → BIP-44 key → viem account), `lib/dc/*` (credential fingerprinting + status logic, registry ABI/client, CVI, Envio GraphQL client, reputation score, copilot context, local store), `lib/api.ts`, `lib/verdict.ts`, `lib/demo-data.ts`, `lib/server/upstream.ts`.
Notable: "Demo mode" when no registry address is set; status vocabulary (`VERIFIED / PENDING / REVOKED / EXPIRED / NOT FOUND / DETAILS DO NOT MATCH / CANNOT CHECK / DEMO`) is well thought-out and transferable.
Deploy: `netlify.toml` (base `web-app`, pnpm filter build) and two `.netlify` folders.

### 1.6 Credential / issuer / verification / revocation / CVI logic — where it lives
- **Issuance:** `CredentialRegistry.issueCredential` / `issueCredentialWithSig` (EIP-712 `CredentialRequest(holder, credentialType, dataHash, expiryTimestamp, nonce, deadline)`); backend `CredentialService.mint`; web `lib/dc/registry.ts` (browser, passkey-signed); `mobile-sdk/src/utils/web3.ts` (unsigned tx builder).
- **Issuer authorization:** owner-managed allow-list (`authorizeIssuer` / `revokeIssuer`). De-authorizing an issuer invalidates all its credentials in `verifyCredential`.
- **Revocation:** `revokeCredential(id, reason)` by issuer or owner; `activeCredentials` counter.
- **Verification:** `verifyCredential` / `isCredentialValid` (exists ∧ not revoked ∧ not expired ∧ issuer still authorized); `recordVerification` emits `CredentialChecked` receipt; web `lib/dc/credential.ts` recomputes the fingerprint and compares → `MISMATCH`.
- **CVI:** `setCviVerifier`, `_requireCviVerifiedIssuer`, `issueHighAssuranceCredential` (needs holder *and* issuer verified), `CviAttestationOracle`, web `lib/dc/cvi.ts`, `CviBadge.tsx`, indexer `CviAttestationOracle` handlers.
- **Reputation:** `lib/dc/reputation.ts` (0–100 activity score, mirrored in the indexer) and on-chain `TrustScore`.

### 1.7 Tests
- `contracts/test`: `CredentialRegistry.t.sol` (639), `CviGate.t.sol` (271), `StakingPool.t.sol` (739), `TrustScore.t.sol` (495), `IdentityRegistry.t.sol` (115), `Counter.t.sol`, `mocks/MockAUSD.sol`.
- `backend/test`: `aiConsensus.test.ts`, `unit/{aiModels,checkAiProviders,promptUtils,modelCache,logger}.test.ts`, `integration/intent-flow.test.ts`, `e2e/api.e2e.ts`, `mocks/mockAIModels.ts`. A stale `backend/coverage/` report is checked into the tree.
- `web-app/src/__tests__`: ~20 files — payment-check (`PaymentCheckPage`, `usePaymentRiskCheck`, `paymentCheckRoute`, `ConsensusResultCard`), credential (`createCredential`, `verify`, `dashboard`, `dcCredential`, `dcAnchored`, `dcIntegration`, `dcUi`, `dcCopilotFallback`, `dcReducedMotion`), plumbing (`api`, `helpers`, `readRoutes`, `story`, mocks/stubs).
- `metamask-snap/test`, `mobile-sdk/test`: SDK/snap unit tests (go away with those packages).

---

## 2. Monad-specific inventory

### 2.1 Chain constants, RPC URLs, explorers, faucet
| Value | Where |
|---|---|
| Chain ID **10143** | `.env.example`, `contracts/.env.example`, `contracts/foundry.toml`, `contracts/script/DeployCredentialFlow.s.sol` (comment), `backend/src/config/index.ts` (default), `backend/.env.example`, `web-app/src/lib/monad.ts`, `web-app/.env.example` (`NEXT_PUBLIC_MONAD_CHAIN_ID`), `indexer/config.yaml`, `metamask-snap/src/config.ts` (`eip155:10143`), `README.md`, `docs/architecture.md` |
| RPC `https://testnet-rpc.monad.xyz` | `backend/src/config/index.ts` (default), `backend/.env.example`, `.env.example`, `contracts/.env.example`, `web-app/src/lib/monad.ts`, `web-app/.env.example` (×2 var names), `indexer/config.yaml`, `docs/hosting.md` |
| Explorer `explorer.testnet.monad.xyz` / `testnet.monadvision.com` | `backend/src/chain/clients.ts`, `web-app/src/lib/chain.ts`, `web-app/src/lib/monad.ts`, `.env.example`, `contracts/.env.example`, `web-app/.env.example`, `docs/hosting.md`, `web-app/.env.local` |
| Faucet `https://faucet.monad.xyz` | `web-app/src/lib/monad.ts`, account menu / `PasskeyButton.tsx` text |
| Native currency `MON` ("Monad") | `backend/src/chain/clients.ts`, `web-app/src/lib/monad.ts`, `web-app/src/lib/dc/registry.ts` (error string "no Monad testnet gas… testnet MON") |
| Foundry RPC alias `monad_testnet` | `contracts/foundry.toml`, `contracts/package.json` (`deploy:testnet`), `DeployCredentialFlow.s.sol` docstring, `web-app/README.md` |
| "Monad blocks are ~400 ms" polling | `backend/src/chain/clients.ts` (500 ms polling interval) |

### 2.2 Environment variables with Monad names
`MONAD_RPC_URL`, `MONAD_CHAIN_ID`, `MONAD_EXPLORER_URL`, `MONAD_EXPLORER_API_KEY`, `MONAD_TESTNET_RPC` (foundry), `NEXT_PUBLIC_MONAD_RPC`, `NEXT_PUBLIC_MONAD_RPC_URL`, `NEXT_PUBLIC_MONAD_CHAIN_ID`, `NEXT_PUBLIC_MONAD_EXPLORER_URL` — across root, `backend`, `contracts`, `web-app` `.env*` files. (`web-app/.env.example` defines the RPC and explorer vars under two different names each; `lib/monad.ts` reads both.)

### 2.3 Deployed contract addresses (Monad testnet, chain 10143)
- `CredentialRegistry` **`0x335de4487bfcc2Aa3D0E68ad67759616DFD25113`** — deployed at block **70607269** (`indexer/config.yaml`, `web-app/.env.local`, `contracts/broadcast/.../run-latest.json`)
- `CviAttestationOracle` **`0x1C825e31a873e227dE77Ec184fd17C25B36508B0`** (same files)
- Indexer `start_block: 70640600` (first credential at 70640655)
- Placeholder: `AUSD = 0x000000000000000000000000000000000000012a` (`StakingPool.sol` comments, `docs/architecture.md`)
- Local Anvil addresses in `backend/.env.local` (not Monad).

### 2.4 Monad-coupled code
- Whole files: `web-app/src/lib/monad.ts`; `indexer/` (entire package targets Monad testnet; Envio is a hackathon-sponsor integration); `metamask-snap/src/config.ts` (`DEFAULT_NETWORKS`), `metamask-snap/src/utils/chain.ts`.
- Heavily referencing: `backend/src/chain/clients.ts`, `backend/src/config/index.ts`, `web-app/src/lib/chain.ts`, `web-app/src/lib/dc/registry.ts` (imports `monadTestnet`), `web-app/src/lib/dc/credential.ts` (user-facing status text says "anchored on Monad"), contract natspec (`@custom:deploy-target Monad testnet` in `CredentialRegistry`, `CviAttestationOracle`, `TrustScore`, `StakingPool`).
- **Mera passkeys** (`@category-labs/mera`, `lib/mera.ts`, `components/account.tsx`, `dc/PasskeyButton.tsx`) — built by Category Labs (Monad's developer). Chain-agnostic in principle (it derives a secp256k1 key from WebAuthn PRF), but it is a Monad-ecosystem hackathon dependency and a key-in-browser model that doesn't fit a Circle-managed-wallet treasury. **Decision needed** (§9).
- UI strings mentioning Monad (counts): `Landing.tsx` ×5, `IssueForm.tsx` ×5, `VerifyView.tsx` ×4, `ScrollStory.tsx` ×4, `RecordCheck.tsx` ×3, `DcChrome.tsx` ×3, `ReceiptView.tsx` ×2, `PasskeyButton.tsx` ×2, `app/layout.tsx` ×2 (site metadata: "…for humans and AI agents on Monad"), `app/page.tsx`, `dashboard/page.tsx`, `credential/create/page.tsx`, `home/hero.tsx`, `DashboardView.tsx`, `CredentialCard.tsx`, `InsightPanel.tsx`; lib: `dc/{credential,registry,store,cvi,checks,copilot-context}.ts`, `hooks/useCredentialStatus.ts`; `api/copilot/route.ts`. Tests asserting those strings: `dcAnchored`, `dcUi`, `dcIntegration`.
- Docs/readmes: `README.md` (×8, incl. "Monad Testnet" section and "Built with ❤️ for the Monad ecosystem"), `web-app/README.md` (×8), `docs/architecture.md` (×8, incl. "0.3 Monad-specific notes"), `docs/hosting.md` (×4), `docs/security-review.md` (×4), `docs/README.md`, `backend/README.md`, `package.json` (description + keyword), `backend/package.json` (description), `contracts/package.json` (description + keyword), `web-app/package.json` (keyword).

### 2.5 Other hackathon-sponsor integrations riding along with Monad (not Monad-named, but same cleanup)
- **Cleanverse CVI** stand-in (contract, ABI in `registry.ts`, `cvi.ts`, `CviBadge`, UI "Step 0", README disclaimers).
- **Envio HyperIndex** (`indexer/`, `lib/dc/envio.ts`, `NEXT_PUBLIC_ENVIO_URL`).
- **Mera** passkeys (above).
- **Kimi / Moonshot, Qwen, "Jev"** model providers (`backend/src/config/*`, `.env*`, `api/copilot/route.ts` default model `kimi-k3`).

---

## 3. Metropolis-specific files and branding

Literal "Metropolis" appears in `web-app/src/components/dc/DcChrome.tsx:57` ("Credentia / Monad Metropolis hackathon"), and in the submission/demo material. Broader hackathon framing ("hackathon demonstration", "does not guarantee credential security or production readiness", "bounty eligibility") is in `Landing.tsx`, `DcChrome.tsx`, `app/page.tsx` metadata, `docs/hosting.md`, both READMEs, `contracts/…/CviAttestationOracle.sol`, `web-app/.env.example`.

Whole directories / files that are hackathon deliverables:
- `demo-production/` (≈85 MB) — `credentia-demo.mp4` (+ no-subtitles), `narration.wav`, `.srt`, `cover.jpg`, `submission-kit.md`, `submission-description-8000.txt`, `verification-report.md`, `narration-script.md`, `README.md`, `source/` (Python/ffmpeg/Chrome-CDP build scripts: `build.py render.py mix.py captions.py music.sh capture.mjs capture_local2.mjs cdp.mjs script.json capture-meta.json`), `pitch-video/` (+ `team.json`, `rebuild-with-team.sh`), `product-demo/`, `logo/`.
- `submission-package/` (≈76 MB) — the same assets re-packaged in numbered folders (`1-text-for-form` … `6-evidence`). **Duplicates `demo-production/`.**
- `docs/security-review.md`, `docs/audit/AuditPoC.t.sol.txt` — hackathon-era review/PoC (review before deleting; may contain still-valid findings about `CredentialRegistry`).
- Logos: `demo-production/logo/credentia-logo*.png` and `submission-package/5-images/credentia-logo*.png` — keep one copy if you want to retain the Credentia mark (rebrand decision).

---

## 4. Reusable Credentia core to keep

| Core capability | Existing asset | Re-use in Treasury Autopsy |
|---|---|---|
| Scoped, signed authority | `CredentialRegistry` EIP-712 `issueCredentialWithSig`, nonces, deadlines, expiry, `MAX_EXPIRY`, ReentrancyGuard, custom errors | **Mandate**: owner (business) signs a mandate to the agent: spend cap, per-tx cap, vendor allow-list, allowed actions (pay / reserve / yield), expiry. Extend the typed-data struct with scope fields; `dataHash` can commit to the full off-chain scope JSON |
| Issuer allow-list + owner admin | `authorizeIssuer/revokeIssuer`, `Ownable` | Business-owner / signer allow-list; move to `Ownable2Step` (docs already recommend it) |
| Revocation | `revokeCredential(id, reason)` | Instantly revoke an agent's mandate |
| Verification / replay | `verifyCredential`, `recordVerification` + `CredentialChecked`; web fingerprint recompute (`lib/dc/credential.ts`) | **Decision log**: each agent action → canonical JSON → hash → signed → anchored; "replay" = recompute hash and re-run policy checks against the stored inputs. Reuse the status vocabulary (VERIFIED / MISMATCH / REVOKED / EXPIRED / NOT FOUND / CANNOT CHECK) |
| Deterministic ID | `_computeCredentialId` | Decision ID / mandate ID |
| Hash-committed off-chain data | `credentialStore.ts` + "serve only if it re-hashes to on-chain hash" in `credentialService.ts` | Decision-log store (file → Postgres); same integrity rule |
| Multi-model risk judgement | `aiConsensusService.ts`, `config/aiModels.ts`, `types/ai.ts`, `promptBuilder.ts`, `promptSanitizer.ts`, `intentHash.ts`, `modelCache.ts`, `prompts/paymentIntent.txt`, `docs/ai-consensus-architecture.md` | **Vendor-risk / payment-risk assessment**: invoice + vendor context → GO/STOP/REVIEW with quorum, injection defence, cache, audit log. Replace the Kimi/Qwen/Jev trio with configured providers (§9) |
| Backend plumbing | `middleware/{auth,rateLimit,errorHandler,requestLogger,notFoundHandler}`, `utils/logger.ts`, `lib/mutex.ts`, zod env config pattern, `chain/clients.ts` shape, `chain/abis.ts` | Keep; swap chain definition to Arc |
| Relayer / simulate-then-write pattern | `CredentialService.mint` | Pattern for agent-initiated transactions (but see §9 on Circle developer-controlled wallets replacing raw private keys) |
| Frontend design system | `components/dc/{StatusBadge, CredentialCard, ShareBlock, RecordCheck, CheckList, ReceiptView, VerifyView, DashboardView, DcChrome, motion}`, `components/evidence/{StatusStamp, CasePanel, EvidenceLabel, States, HelpTip}`, `styles/dc.css`, Tailwind config, demo-mode pattern | "Autopsy" report UI: case file per decision, evidence labels, status stamps, share/verify links, receipts |
| Reputation scoring | `lib/dc/reputation.ts` (+ doc'd breakdown) | Agent/vendor track record (needs new inputs) |
| Test patterns | `CredentialRegistry.t.sol` (639 lines), `aiConsensus.test.ts`, `dc*.test.tsx` | Port and adapt |
| API contract | `docs/api.yaml` (OpenAPI) | Rewrite for new endpoints, keep format |

---

## 5. Files that can be safely deleted

Safe = not needed by the new product, and nothing in the kept set imports them (verified by reading the import graph for the backend and by the dependency list for the web app; **re-run `pnpm -r typecheck` and tests after each deletion phase**).

**Hackathon deliverables / duplicates**
- `demo-production/` (entire)
- `submission-package/` (entire)
- `docs/audit/AuditPoC.t.sol.txt` and `docs/security-review.md` — *after* skimming for findings still applicable to the kept registry (see Phase 0)

**Unused packages (not used by web-app or backend)**
- `mobile-sdk/` (entire; it only calls the old trust-score/credential REST API)
- `metamask-snap/` (entire; `web-app/README.md` already says "not used by the web app"; includes a `dist/bundle.js` that `du` shows as empty)
- `indexer/` (entire; Envio config pinned to Monad; replace with a small event reader/DB in the backend, or re-evaluate Envio for Arc later)

**Contracts**
- `contracts/src/{Counter, IdentityRegistry, TrustScore, StakingPool, CviAttestationOracle}.sol`
- `contracts/src/interfaces/{ICviVerifier, IStakingPool, ITrustScore}.sol`
- `contracts/script/{Counter.s.sol, Deploy.s.sol}`
- `contracts/test/{Counter, IdentityRegistry, StakingPool, TrustScore, CviGate}.t.sol`, `contracts/test/mocks/MockAUSD.sol`
- Generated: `contracts/out/`, `contracts/cache/`, `contracts/broadcast/` (**keep a copy of `broadcast/…/10143/run-latest.json` in the archive tag/branch; it is the only record of the Monad deployment**)

**Backend**
- `backend/prisma/` (dead schema, no Prisma dependency)
- `backend/src/controllers/identity.controller.ts`, `routes/identity.routes.ts` (stubs returning fake data); `backend/src/controllers/{agent,trustScore}.controller.ts`, `services/{agentService,trustScoreService}.ts` unless you keep a vendor/agent score (check what `agentService` does first — not yet read)
- `backend/coverage/` (generated), `backend/scripts/deploy-local.sh` (Anvil deploy of old contracts)
- `backend/.env`, `backend/.env.local`: keep **locally** but never commit; they will be regenerated from the new `.env.example`

**Web app**
- Routes: `app/payment-story/`, `app/trust-dashboard/`, `app/credential/` (both create & verify), `app/api/trust-score/`, `app/api/agent-credentials/`, `app/api/credential/` (re-created later for decisions)
- Components: `components/story/` (all), `components/dashboard/` (all), `components/home/` (all), `components/dc/{CviBadge, ScrollStory, SmoothScroll, PasskeyButton*, IssuerRecord*, InsightPanel*, Copilot*}` (* = keep only if the §9 decisions say so), `ModelVerdictCard.tsx` (superseded by `ConsensusResultCard`, confirm)
- Libs: `lib/monad.ts`, `lib/dc/{cvi.ts, envio.ts}`, `lib/mera.ts` (if Mera is dropped), `lib/demo-data.ts` (rewrite), `hooks/{useCvi, useTrustScore, useCredential, useCredentialStatus, useInsight}.ts`
- Tests tied to the above: `story.test.tsx`, `dcCopilotFallback`, `dcReducedMotion` (if SmoothScroll removed), `dcAnchored` (rewrite), `readRoutes.test.ts`
- Generated/junk: `web-app/tsconfig.tsbuildinfo`, `web-app/.netlify/`, root `.netlify/`, all `.DS_Store` (≥10 of them)

**Repo-root / docs scaffolding**
- Root `.env.example` and root `.env` — a 40-line generic template (Alchemy, Infura, Etherscan, SMTP, Pinata, JWT, Redis, Mixpanel, Snap ID, WalletConnect…) **none of which is read by the code**; replace with a short real one
- Docs index links to ~25 files that don't exist (`docs/README.md`): rewrite the index. Files under `docs/{contracts,guides,security}/` exist as empty/partial folders — check, then delete or fill.
- `docs/CONTRIBUTING.md`, `docs/SECURITY.md`: generic; keep or trim.
- `LICENSE` — keep.

---

## 6. Files to rename or refactor

| Current | Action |
|---|---|
| Repo/product name & copy ("Credentia" → "Credentia Treasury Autopsy") | `package.json` names/descriptions/keywords (`@credentia/*` scope can stay or become `@treasury-autopsy/*`—decide), `layout.tsx` metadata, `README.md`, footer/header |
| `contracts/src/CredentialRegistry.sol` → `MandateRegistry.sol` (+ `DecisionLog.sol` or merged) | Keep the EIP-712 skeleton; replace `CredentialRequest` with `Mandate{agent, scopeHash, spendCap, perTxCap, expiry, nonce, deadline}`; drop CVI gate and "high-assurance" path; `Ownable` → `Ownable2Step`; add decision anchoring (`recordDecision(mandateId, decisionHash, outcome)`) |
| `interfaces/ICredentialRegistry.sol` → `IMandateRegistry.sol` | follow above |
| `contracts/script/DeployCredentialFlow.s.sol` → `DeployTreasury.s.sol` | rpc alias `arc_testnet`; remove oracle |
| `contracts/foundry.toml` | `chain_id`, `rpc_endpoints.arc_testnet`; optionally pin solc (docs claim it is pinned; it is not) |
| `backend/src/chain/clients.ts` | Arc chain def (native currency is USDC, 18 decimals for gas but 6 for the ERC-20 interface — **verify against Circle docs**), remove "400 ms Monad" comment, parameterise explorer |
| `backend/src/config/index.ts` | `MONAD_*` → `ARC_RPC_URL`, `ARC_CHAIN_ID`, `ARC_EXPLORER_URL`; `CREDENTIAL_REGISTRY_ADDRESS` → `MANDATE_REGISTRY_ADDRESS`; add `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_SET_ID`, `USDC_ADDRESS`; `KIMI/QWEN/JEV` → generic `RISK_MODEL_{1,2,3}_*` |
| `backend/src/config/aiModels.ts`, `types/ai.ts` (`ModelName = 'kimi'|'qwen'|'jev'`) | generalise model names; keep quorum logic |
| `backend/src/services/aiConsensusService.ts` → `riskAssessmentService.ts` | Keep logic; change `PaymentIntent` to an invoice/vendor/treasury-state input; keep injection handling (invoice text is attacker-controlled input — this is the same threat as the old `context` field) |
| `backend/src/services/credentialService.ts` → `mandateService.ts` + `decisionService.ts` | Mint → create mandate; add record-decision |
| `backend/src/store/credentialStore.ts` → `decisionStore.ts` | Same integrity rule; move to Postgres via Prisma/Drizzle when persistence matters |
| `backend/src/prompts/paymentIntent.txt` → `invoicePayment.txt` (+ `vendorRisk.txt`, `yieldAllocation.txt`) | Re-tune; remove "AI agents and people" wording |
| `backend/src/routes/v1.routes.ts`, `controllers/*` | new resources: `/mandates`, `/decisions`, `/invoices`, `/vendors`, `/treasury` |
| `web-app/src/lib/chain.ts`, `lib/dc/registry.ts` | de-Monad; Arc chain from one config module |
| `web-app/src/lib/dc/credential.ts` | → `lib/decision/fingerprint.ts` (fingerprint, status resolution); rewrite status strings ("anchored on Arc") |
| `web-app/src/components/dc/*` | rename folder to `components/treasury/` or `components/autopsy/`; `CredentialCard` → `MandateCard`/`DecisionCard`; `IssueForm` → `MandateForm`; `VerifyView`/`ReceiptView` → `ReplayView`/`DecisionReceipt` |
| `web-app/src/app/layout.tsx`, `page.tsx` | metadata + hero copy |
| `web-app/src/components/layout/{header,footer}.tsx`, `DcChrome.tsx` | remove hackathon/Monad footer; new nav |
| `web-app/.env.example` | Arc vars, Circle vars; drop `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_ENVIO_URL`, CVI vars, `MOONSHOT_*` |
| `netlify.toml` | keep if staying on Netlify; update comment/header; fix `hosting.md` accordingly |
| `docs/architecture.md`, `docs/ai-consensus-architecture.md`, `docs/api.yaml`, `docs/hosting.md`, `docs/integrations.md` | rewrite for treasury; ai-consensus doc is mostly reusable |
| Root `package.json`/`pnpm-workspace.yaml` | remove `mobile-sdk`, `metamask-snap` from workspace; add new packages (e.g. `packages/policy`, `packages/shared`) |

---

## 7. Dependencies to remove

**web-app/package.json**
- `@category-labs/mera`, `@scure/bip32`, `@scure/bip39` — only used by `lib/mera.ts` (remove if passkey accounts are dropped; see §9)
- `lenis` — only used by landing smooth-scroll (`SmoothScroll.tsx`)
- Review for removal after the UI is rebuilt: `qrcode.react` (share link QR — keep if share links stay), `sonner`, `motion`, `zustand`/`react-hook-form`/`@hookform/resolvers` (check actual use), keyword `"monad"`.
- Keep: `next`, `react`, `viem`, `zod`, `tailwind*`, `@tanstack/react-query`, `lucide-react`, `clsx`, `tailwind-merge`, test stack.

**backend/package.json**
- No Monad npm packages. Description string only. (No Prisma deps present even though the schema exists.)
- Add later (not now): Circle SDK(s) (`@circle-fin/developer-controlled-wallets`, possibly `@circle-fin/modular-wallets-core`, CCTP/Gateway tooling as needed — confirm current package names in Circle docs), a DB client.

**contracts/package.json**
- `@typechain/ethers-v6`, `typechain` (script `typechain` references ethers-v6 and nothing in the repo uses it, since viem is the client) — optional removal
- Description + keyword `monad`; scripts `deploy:testnet` (`monad_testnet`).

**Removed with their packages**
- `mobile-sdk/*` deps (react-native, wagmi example app, etc.), `metamask-snap/*` deps (`@metamask/snaps-*`), `indexer/*` deps (`envio`, its `package-lock.json`).

**Vendored Solidity libs**
- `contracts/lib/forge-std`, `contracts/lib/openzeppelin-contracts` are plain directories (no `.gitmodules`, no submodule metadata). Decide: commit them, or convert to `forge install` submodules, before the first commit. OZ is 5.7.0 per `docs/architecture.md`.

---

## 8. Recommended structure for Credentia Treasury Autopsy

```
credentia-treasury-autopsy/
├── README.md                      # product pitch, architecture diagram, quickstart (Arc + Circle)
├── LICENSE
├── package.json / pnpm-workspace.yaml
├── .env.example                   # short, real, documented
├── .gitignore                     # + out/ cache/ broadcast/ .next/ data/ *.tsbuildinfo
├── apps/
│   ├── web/                       # Next.js 14 (from web-app/)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx                  # landing
│   │       │   ├── onboarding/               # create business, fund wallet, set policy
│   │       │   ├── mandates/                 # issue / list / revoke agent mandates
│   │       │   ├── treasury/                 # balances, reserve target, yield positions
│   │       │   ├── invoices/                 # inbox, agent decisions, approve/override
│   │       │   ├── vendors/                  # vendor profiles + risk
│   │       │   ├── autopsy/[decisionId]/     # replayable decision report (public share link)
│   │       │   └── api/                      # thin server proxies (keep API keys server-side)
│   │       ├── components/{autopsy,treasury,ui,layout}/
│   │       └── lib/{chain.ts,fingerprint.ts,api.ts,format.ts}
│   └── api/                       # Express service (from backend/)
│       └── src/
│           ├── config/            # env (zod), chain, model config
│           ├── chain/             # Arc viem client, ABIs
│           ├── circle/            # Circle wallets / transfers / CCTP / yield adapters
│           ├── agent/             # treasury agent loop (plan → check policy → act)
│           ├── policy/            # mandate scope checks (caps, allow-list, expiry), pure + unit-tested
│           ├── risk/              # LLM quorum risk engine (from aiConsensus), prompts/
│           ├── decisions/         # decision log: canonicalise → hash → sign → anchor → replay
│           ├── services/          # mandateService, invoiceService, vendorService, treasuryService
│           ├── store/             # decision/mandate stores (file → Postgres)
│           ├── routes/ controllers/ schemas/ middleware/ utils/ lib/
│           └── prompts/
├── packages/
│   ├── contracts/                 # Foundry (from contracts/)
│   │   ├── src/{MandateRegistry,DecisionLog}.sol + interfaces/
│   │   ├── script/DeployTreasury.s.sol
│   │   └── test/
│   ├── shared/                    # zod schemas + types shared by web/api (Mandate, Decision, Invoice, Vendor)
│   └── policy/                    # (optional) pure policy engine used by both API and replay UI
├── docs/
│   ├── README.md
│   ├── architecture.md            # system, trust model, threat model
│   ├── decision-log-spec.md       # canonical JSON, hashing, EIP-712 types, replay algorithm
│   ├── agent-policy.md            # mandate scopes, what the agent may/may not do
│   ├── risk-engine.md             # (from ai-consensus-architecture.md)
│   ├── api.yaml
│   └── hosting.md
└── scripts/                       # local dev: anvil/arc fork deploy, seed demo business
```
Moving `web-app/`→`apps/web/`, `backend/`→`apps/api/`, `contracts/`→`packages/contracts/` is optional; it can be deferred if you'd rather keep the current names and avoid import churn (see Phase 1 note).

---

## 9. Decisions I need from you (these change the plan)

1. **Wallet model.** Business-owner approval today is a Mera passkey (key derived in the browser) and the agent acts via a backend relayer holding raw private keys (`ISSUER_PRIVATE_KEYS`, `BACKEND_WALLET_PRIVATE_KEY`). For a Circle-based product the natural fit is **Circle developer-controlled wallets** for the agent and a user-controlled / passkey wallet or plain EOA for the owner who signs mandates. Should I plan to (a) drop Mera and raw-key relaying entirely, (b) keep Mera just for owner signing, or (c) other?
2. **LLM providers.** Keep the 3-model quorum? If so, which providers (current: Kimi, Qwen, "Jev"; all hackathon-driven)? A single provider with 3 differently-prompted checks would be simpler to run.
3. **Yield source.** "Allocate idle USDC to yield" on Arc needs a concrete venue (a Circle product, a tokenised money-market fund, or a testnet mock). For the first milestone I'd suggest a **mock yield adapter** behind an interface.
4. **Persistence.** Stay on file store for the demo, or introduce Postgres now (the unused Prisma schema shows the earlier intent)?
5. **Directory renames.** Restructure into `apps/` + `packages/` now (Phase 1) or later?
6. **Branding.** Keep the Credentia mark/logos and the `@credentia/*` package scope?
7. **Arc specifics to confirm in Circle's docs before coding** (I'm going from memory and have not verified): testnet chain ID, RPC and explorer URLs, USDC as native gas token (decimals differ between native-gas representation and the ERC-20 interface), USDC contract address, faucet, available Circle products on Arc testnet (Wallets, CCTP, Gateway, Paymaster/Gas Station).

---

## 10. Phased implementation plan

Each phase ends in a green `pnpm -r typecheck && pnpm -r test` (and `forge test`) before moving on, and gets its own commit.

### Phase 0 — Snapshot & safety (≈30 min, no deletions)
- Fix `.gitignore` (`out/ cache/ broadcast/ .next/ .netlify/ data/ *.tsbuildinfo .DS_Store *.mp4 *.wav`) and confirm `git status --ignored` shows every `.env*` as ignored.
- Make the first commit on `main`, then tag `monad-metropolis-final` (and push to a private remote if you want a backup). Copy `contracts/broadcast/.../run-latest.json` and the two deployed addresses into the tag's `README` or a `docs/archive/monad-deployment.md`.
- Run the existing test suites once (`forge test`, `pnpm -r test`) and record pass/fail in the commit message, so later breakage is attributable.
- Rotate any key from `backend/.env*` that ever touched anything real.
- Skim `docs/security-review.md` and `docs/audit/AuditPoC.t.sol.txt` for findings against `CredentialRegistry` that should carry over.

### Phase 1 — Removal (1 commit per bullet group)
1. Delete `demo-production/`, `submission-package/`, `mobile-sdk/`, `metamask-snap/`, `indexer/`; update `pnpm-workspace.yaml` / root `package.json` workspaces; `pnpm install` to refresh the lockfile.
2. Delete unused contracts/tests/scripts (§5) and generated dirs; `forge build && forge test` must still pass for the registry.
3. Delete backend stubs (`identity*`, `prisma/`, `coverage/`, `deploy-local.sh`), and the trust-score/agent routes (after reading `agentService.ts`).
4. Delete unused web routes/components/hooks/libs (§5) and their tests; fix imports until `next build` and `tsc --noEmit` pass.
5. Delete root template `.env.example`/`.env` and stale `docs/` pages; remove generated files and `.DS_Store`s.

### Phase 2 — De-Monad & rebrand shell (no new features)
- Introduce a single chain-config module (backend + web) driven by env, remove `MONAD_*`, rename to `ARC_*`/generic, update Foundry alias.
- Replace all UI/README/metadata copy; remove hackathon disclaimers and "Metropolis" footer; new landing skeleton and nav.
- Remove CVI gate code from `CredentialRegistry` (+ its tests) and the `ICviVerifier` interface.
- Drop Mera/`@scure/*`/`lenis` according to §9.1 and fix the account layer to a temporary stub (injected wallet or Circle sandbox).

### Phase 3 — Contracts: MandateRegistry + DecisionLog
- Refactor `CredentialRegistry` → `MandateRegistry` (scoped EIP-712 mandate, `Ownable2Step`, revoke, expiry); add `DecisionLog` (`recordDecision(mandateId, decisionHash, action, outcome)`, event-only plus a mapping for existence); port and extend tests (fuzz the scope/cap checks).
- Deploy script for Arc testnet; save addresses in `docs/` and `.env.example`.

### Phase 4 — Backend: policy, decision log, risk engine
- `policy/`: pure functions `checkMandate(mandate, proposedAction, state)` → `ALLOW / DENY(reason)`; exhaustive unit tests.
- `decisions/`: canonical JSON → keccak256 → EIP-712 sign → store → anchor; `replay(decisionId)` re-hashes stored inputs and re-runs `checkMandate` + risk verdict from the stored model outputs.
- `risk/`: port the consensus engine (rename, new input types, new prompts); keep the injection tests and add invoice-injection cases.
- `store/`: decision store with the same "serve only if it re-hashes" rule.

### Phase 5 — Circle + Arc integration
- `circle/` wallet adapter (create wallet, balance, transfer USDC) behind an interface with a **mock implementation first**; then the real Circle sandbox implementation.
- Treasury agent loop: ingest invoice → vendor risk → policy check → pay / hold for review / reject; reserve-ratio rule; mock yield adapter for idle balance. Every branch writes a decision record.

### Phase 6 — Web app
- Pages in §8; the **Autopsy** page is the hero: shows inputs, policy checks, model votes, signature, on-chain anchor, and a "Replay" button that recomputes and displays `VERIFIED / MISMATCH`.
- Reuse the status/evidence components and the demo-mode pattern (no chain configured → clearly labelled demo).

### Phase 7 — Hardening & docs
- Threat model (invoice prompt injection, vendor impersonation, replayed signatures, relayer key compromise, runaway agent), rate limits, spend-cap invariants; update `docs/*`; end-to-end test with a seeded business; README with demo script.

---

## Appendix A — Audit coverage and known gaps
- **Read in full:** root configs, `README.md`, `.env.example`s, `backend/src/{config,chain/clients,app,routes/v1,services/{credential,aiConsensus,intent,trustScore},store,controllers/identity}`, `paymentIntent.txt`, `CredentialRegistry.sol`, `CviAttestationOracle.sol`, deploy scripts, `foundry.toml`, `prisma/schema.prisma`, web `lib/{chain,monad}`, `web-app/README.md`, `metamask-snap/{config,manifest}`, `mobile-sdk/utils/web3.ts`, `indexer/config.yaml`.
- **Skimmed (headers/head only):** `TrustScore.sol`, `StakingPool.sol`, `IdentityRegistry.sol`, `lib/dc/registry.ts`, `lib/mera.ts`, `api/payment-check/route.ts`, `docs/README.md`.
- **Listed but not opened:** most `web-app/src/components/**`, `web-app/src/__tests__/**`, `backend/src/{controllers/agent,services/agentService,routes/intent,middleware/*,schemas,utils/*}`, `docs/{api.yaml,integrations,ai-consensus-architecture,security-review,SECURITY,CONTRIBUTING}`, mobile-sdk/snap sources, demo scripts.
- **Not scanned:** binary files (mp4/wav/png/jpg), `node_modules/`, vendored `contracts/lib`.
- **Not verified:** that the current tests pass; Arc/Circle facts in §9.7.
- Env files: key names listed; **values not read** (apart from public, non-secret chain config values: contract addresses and chain id).
