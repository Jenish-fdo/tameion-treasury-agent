# Credentia Treasury Autopsy

> An AI treasury agent for small businesses managing USDC on Arc, with a signed, replayable record of every decision.

**Status: early build on Arc testnet. Not audited, not for real funds.**

## The idea

A business owner grants an AI agent a **scoped mandate**: which vendors it may pay, how much per payment and in total, how long the authority lasts. The agent then pays invoices, keeps a cash reserve, assesses vendor risk and parks idle USDC in yield. Every financial action it takes produces a **signed decision record**, anchored on Arc, that anyone can **replay** to check what the agent saw, which rules it applied and why it acted.

Built on [Arc](https://docs.arc.io) (Circle's L1, USDC as the native gas token) and Circle's tooling.

## What works today, and what does not

| Part | State |
|---|---|
| Record layer: issue, share and verify signed records anchored by an EIP-712 registry (`contracts/src/CredentialRegistry.sol`) | Works (demo mode needs no chain) |
| Multi-model payment risk verdict with a quorum and prompt-injection defence (`backend/src/services/aiConsensusService.ts`) | Works against OpenAI-compatible providers you configure |
| Mandates, decision log, invoices, vendors, treasury agent, Circle wallets, yield | **Not built yet** (Phases 3 to 6 of [`CLEANUP_PLAN.md`](./CLEANUP_PLAN.md)) |
| Account sign-in | A signed-out placeholder; on-chain issuing from the browser is unavailable until Circle wallets land |

## Repository

```
contracts/   Foundry: CredentialRegistry (becomes the mandate and decision registry)
backend/     Express API: credential mint/verify, multi-model risk verdict
web-app/     Next.js 14: landing, issue, verify, receipt, dashboard, payment check
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
