# Tameion Agents Hackathon: submission notes

Deadline: **October 17, 11:59 PM ET** (about 09:29 IST on October 18). Form: <https://forms.gle/BBWrdfuircrKiG2i6>. Needs a public GitHub repo, a video under 3 minutes, and answers to the traction questions. A live link is optional.

## What this is

An AI treasury agent for a small business, settled on Arc in USDC. The owner grants the agent a **mandate** (allowed categories, recipients, per-transaction and daily/weekly/monthly caps, a human-approval threshold, an expiry). The agent pays only inside it. Every decision, whether paid, refused or held for a human, is appended to a hash-chained **decision log** that anyone can replay and verify. This is the "continuous audit" idea (Prior Art 01) with the guardrail from FAQ Q4: "bounded by something it cannot talk its way past".

## The payment path (new)

`POST /api/v1/mandates/:id/pay` does, in order: ask `MandateRegistry` whether the mandate allows the payment; if not, log a `REJECTION`; if the amount reaches the approval threshold, log an `ESCALATION` and stop; otherwise `consume` the spend on-chain, send USDC to the recipient through Arc's USDC contract, and log the `PAYMENT` as `EXECUTED` with the transfer's transaction hash. The registry is a policy ledger and cannot move funds, so this endpoint is what makes the payment real. Tested end to end on an Arc-faithful local node (`backend/test/e2e/payments.e2e.ts`, 8 tests, real USDC balance changes, the human-approval signature path included).

## Against the judging weights

| Weight | Where we stand |
|---|---|
| Agentic sophistication 30% | The agent supplies a rationale and risk score per payment; the contract enforces the mandate; refusals and escalations are first-class decisions in the log. Honest limit: the rules are deterministic, and the backend's `aiConsensusService` is not yet what drives the pay decision. |
| Traction 30% | Whatever real usage you generate. Answer the form with true numbers only. Run `backend/scripts/demo-run.mjs` against testnet and add any real business you onboard. |
| Circle tool usage 20% | Arc, native USDC (ERC-20 interface at `0x3600…0000`), custom contracts. **Not used: Wallets, Paymaster, App Kit, CCTP, Gateway, USYC.** Do not claim them. Developer-controlled Wallets would replace the demo agent key; that needs a Circle API key and entity secret that only you can create. |
| Innovation 20% | Mandates plus a verifiable, replayable decision chain, with human approval as an EIP-712 signature bound to one payment. |

## Disclosures to put in the README or form

- The repository began as a Monad hackathon project (tag `monad-metropolis-final` is that state). The treasury product (MandateRegistry, DecisionLog, payment path, Arc configuration) was built for this event. FAQ Q6 allows an existing project with real progress; say so plainly.
- Unaudited, Arc testnet only, never real funds. `docs/security-review.md` and `docs/ARC_TESTNET_DEPLOYMENT.md` section 2a hold the review.
- The demo API holds the owner and agent keys (testnet only). A public web demo would let a visitor spend the demo agent wallet inside a mandate they create. Keep that wallet small, or do not publish the live link.

## Run the demo on Arc testnet (about 10 minutes after the contracts are deployed)

1. Put the deployed addresses and your **testnet-only** keys in `backend/.env` (never commit it): `ARC_NETWORK=testnet`, `MANDATE_REGISTRY_ADDRESS`, `DECISION_LOG_ADDRESS`, `BUSINESS_OWNER_PRIVATE_KEYS` (owner key), `BACKEND_WALLET_PRIVATE_KEY` (relayer key, which doubles as the agent wallet), `API_KEYS` (any 32+ character secret).
2. Fund both addresses with testnet USDC at <https://faucet.circle.com> (Arc Testnet). The agent wallet needs about 15 USDC; the owner needs a little for gas.
3. `cd backend && npm run dev`
4. In another terminal: `API_BASE=http://localhost:3001/api/v1 API_KEY=<your API key> node scripts/demo-run.mjs`
   It creates a business and a mandate, makes three payments, has two refused (over the limit, unknown recipient) and one held for approval, and prints the explorer links and the log summary.
5. Open the web app (`cd web-app && npm run dev`), paste the printed business id into the picker, and show Mandates, Decisions (hash-verified, transfer links) and Check a payment (Send USDC).

## Video outline (under 3 minutes)

1. 0:00 Problem: an agent that can spend your money needs a limit it cannot argue with, and a record you can replay.
2. 0:25 Owner grants a mandate (screen: Mandates).
3. 0:55 Agent pays three invoices; show the transfers on the Arc explorer.
4. 1:30 Agent tries an over-limit payment and an unknown payee; both refused, both logged.
5. 1:55 A larger payment is held for the owner; show it in pending approvals; owner signs; it pays.
6. 2:25 Decision log: every record hash-verified and chained; contracts deployed and verified on the Arc explorer.
7. 2:45 What is next and what is honest: testnet, unaudited.

## Traction answers (fill with real numbers only)

- Businesses onboarded: ___ (the demo business counts only if you say it is a demo)
- Value the agent moved: ___ USDC, ___ payments (from the demo log and any real use)
- Problem solved for them: ___
