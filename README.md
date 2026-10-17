# Credentia Treasury Autopsy

> An AI treasury agent for small businesses managing USDC on Arc, with a signed, replayable record of every decision.

**Status: working prototype on Arc testnet. Not audited, not for real funds.** Built for the Tameion Agents Hackathon (Canteen x Circle).

## The idea

A business owner grants an AI agent a **mandate**: which categories and recipients it may pay, how much per payment and per day, week and month, when a human must approve, and when the authority expires. The agent pays inside it, in USDC on Arc. Every decision, whether paid, refused or held for a human, is appended to a hash-chained **decision log** that anyone can replay and verify. The contract enforces the mandate; the agent cannot talk its way past it.

Built on [Arc](https://docs.arc.io) (Circle's L1, USDC as the native gas token).

## Live on Arc testnet (chain 5042002)

| Contract | Address | Source |
|---|---|---|
| MandateRegistry | [`0x987bf754526d2dAff347f76ed69A9d9bA854deDB`](https://explorer.testnet.arc.io/address/0x987bf754526d2dAff347f76ed69A9d9bA854deDB) | verified on the explorer |
| DecisionLog | [`0x9C740F76f39a90A1D201cdB0b30b323A30aeB64D`](https://explorer.testnet.arc.io/address/0x9C740F76f39a90A1D201cdB0b30b323A30aeB64D) | verified on the explorer |

Neither contract has an owner, admin, pause switch or proxy. Real USDC payments made by the agent through this deployment are listed in [`docs/HACKATHON_SUBMISSION.md`](./docs/HACKATHON_SUBMISSION.md).

## What works today, and what does not

| Part | State |
|---|---|
| `MandateRegistry`: scoped, expiring, revocable mandates; per-signer nonces; spend buckets; human approval by EIP-712 signature (EOA and ERC-1271) | Works. 83 tests. |
| `DecisionLog`: append-only, per-business hash chain, idempotent client refs, escalation follow-ups | Works. 31 tests. |
| `POST /mandates/:id/pay`: validate, record the spend, send USDC, log the decision with the transfer hash | Works on Arc testnet. 8 end-to-end tests with real USDC balance changes. |
| Web app: mandates, decision log (hash-verified, explorer links), check and send a payment | Works. |
| Credential records (`CredentialRegistry`) and multi-model payment-risk verdict (`aiConsensusService.ts`) | Carried over from the project this started as; works against providers you configure. |
| Not built: Circle Wallets, Paymaster, USYC yield, CCTP/Gateway, invoice reading, vendor risk, real sign-in | Planned. The demo API holds testnet-only owner and agent keys. |

**Honest limits.** The registry is a policy ledger: it cannot move funds, so the API sends the USDC after the contract authorises it. A compromised agent key could still send USDC without asking the registry; the mandate bounds what an honest agent does and makes every action auditable, it is not custody. Unaudited; see [`docs/security-review.md`](./docs/security-review.md) and section 2a of [`docs/ARC_TESTNET_DEPLOYMENT.md`](./docs/ARC_TESTNET_DEPLOYMENT.md).

**Provenance.** This repository began as a Monad hackathon project (the pre-cleanup state is tagged `monad-metropolis-final`). The treasury product above, the Arc migration and the payment path were built for this event.

## Repository

```
contracts/   Foundry: MandateRegistry, DecisionLog, CredentialRegistry, deploy and verify scripts
backend/     Express API: businesses, mandates, payments, decisions; credential mint/verify; risk verdict
web-app/     Next.js 14: mandates, decision log, check and send a payment, credentials
docs/        Architecture notes, OpenAPI, hosting
```

## Quick start

Prerequisites: Node 20+, pnpm 9.5 (`corepack pnpm@9.5.0 ...` works without installing it), Foundry.

```bash
pnpm install
cp backend/.env.example backend/.env       # set API_KEYS (openssl rand -hex 32); model keys are optional
cp web-app/.env.example web-app/.env.local
pnpm --filter @credentia/backend dev        # http://localhost:3001
pnpm --filter @credentia/web-app dev        # http://localhost:3000

pnpm --filter @credentia/web-app test       # web tests
pnpm --filter @credentia/backend test       # backend tests
(cd contracts && forge test)                # contract tests
```

## Arc network

Defaults live in `backend/src/chain/arc.ts` and `web-app/src/lib/arc.ts` and can be overridden with `ARC_*` / `NEXT_PUBLIC_ARC_*` variables.

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 5042002 | 5042 |
| RPC | https://rpc.testnet.arc.io | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.testnet.arc.io | https://explorer.arc.io |
| Faucet | https://faucet.circle.com | n/a |

USDC (`0x3600000000000000000000000000000000000000`, same on both) is the native gas token with **18 decimals** as a native balance, and **6 decimals** through its ERC-20 interface. They are the same balance in two units; never show or add them separately.

## Security

Report vulnerabilities per [`docs/SECURITY.md`](./docs/SECURITY.md). Real `.env` files are git-ignored; commit only `.env.example`.

## License

MIT, see [`LICENSE`](./LICENSE).
