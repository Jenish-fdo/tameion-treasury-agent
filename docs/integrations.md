# Integrations: MetaMask Snap and React Native SDK

> Credentia provides explainable trust and AI risk signals before a payment. It does not guarantee transaction safety.
> Only a GO verdict means "safe to proceed". A valid credential or a high trust score is not a guarantee.

**Status: both integrations are built and tested, with two limits.** Neither has been run in a real MetaMask or on a real
device, and neither is published. Details below.

## What exists and is tested

### Mobile SDK core (`mobile-sdk/src`)

| File | Purpose |
|---|---|
| `CredentiaSDK.ts` | `checkTrustScore`, `verifyCredential`, `getAgentCredentials`, `mintCredential` |
| `api/client.ts` | `fetch` GET client: timeout, cancellation, status mapping, optional `x-api-key` |
| `api/trustScore.ts`, `api/credentials.ts` | Response validation and normalisation |
| `utils/validation.ts`, `utils/errors.ts` | Input checks and fixed-text errors (`CredentiaError`) |
| `utils/web3.ts` | Builds an **unsigned** `issueCredential` transaction with viem |
| `types/index.ts` | Public types |

Behaviour worth knowing:

- Reads call the real Credentia API (`/api/v1/trust-score/:address`, `/credential/:id/verify`, `/agent/:address/credentials`).
- **`mintCredential` never signs or sends.** It returns `PREPARED` with unsigned calldata for
  `CredentialRegistry.issueCredential(holder, type, dataHash, expiry)`, which only an authorised issuer's wallet can
  execute. Without `chainId` and `registryAddress` it returns `UNAVAILABLE` with a message. It never returns a
  transaction hash or credential ID, because none exists.
- The SDK holds no keys. A test scans the source to enforce that it never references private keys or signing calls and never logs.
- `verifyCredential` returns status `NOT_FOUND` for an unknown credential (a normal answer, not an error). The verify
  endpoint does not return the credential type, so `type` is `"unknown"` there.
- `breakdown` has the three factors the on-chain TrustScore contract reports (`credentials`, `attestations`,
  `staking`), not the five in the original brief, which the contract does not provide.
- An API key bundled in a mobile app can be extracted from the app. Use a low-privilege, rate-limited key or your own backend.

### Snap core (`metamask-snap/src`)

| File | Purpose |
|---|---|
| `utils/transaction.ts` | Extracts the recipient from the unsigned payload |
| `utils/chain.ts` | CAIP-2 (`eip155:<id>`) parsing; only explicitly configured chains are supported |
| `utils/score.ts` | Score categories and fixed, qualified wording |
| `services/credentiaApi.ts` | Trust and credentials lookup, timeout, fail-safe results |
| `types/trust.ts` | Types |

Behaviour worth knowing:

- **ERC-20 transfers:** for `transfer` and `transferFrom`, the transaction's `to` is the *token contract*; the real
  recipient is decoded from calldata. Other contract calls return no recipient rather than a misleading lookup of the contract.
- Score tiers: 0-30 LOW TRUST, 31-60 LIMITED EVIDENCE, 61-100 STRONGER EVIDENCE; an address never scored is
  NO TRUST DATA, not LOW. Wording never says "trusted", "safe" or "verified payment".
- **Every failure is a neutral "unavailable" result** (timeout, network, 401/403/429/5xx, malformed JSON, missing
  configuration, unsupported chain, invalid address). No failure path carries a score or a trust flag.
- Only the public recipient address is sent to the API, in the URL path. Nothing else from the transaction is sent.
- A labelled **demo mode** returns deterministic DEMO profiles (low, medium or high by the last hex digit of the address)
  so the three states can be tried without a backend. It is off by default and never calls the API.

## Tests (all run locally, none contact a real API, provider, wallet or chain)

- **Snap** (`metamask-snap`): `pnpm typecheck`, `pnpm test` (121 unit tests: recipient extraction incl. ERC-20, CAIP-2, score tiers,
  every API failure mode, handlers and UI wording, RPC validation, privacy, manifest permissions), `pnpm build`, and
  `pnpm test:integration` (3 tests that load the *built bundle* in MetaMask's Snap simulator, built in demo mode so there is no network).
- **Mobile SDK** (`mobile-sdk`): `pnpm typecheck`, `pnpm test` (77 tests: validation, normalisation, HTTP/timeout/cancel mapping,
  the four SDK methods, prepared calldata decoded back to the request, source scans proving no key/signing/logging, hooks, components), `pnpm build`.

## Versions and decisions

- Snap: `@metamask/snaps-sdk` **12.0.1** (pinned; 12.1.0 declares a platform version production MetaMask does not support yet),
  `snaps-cli` 8.4.1, `snaps-jest` 10.2.1. UI uses the SDK's JSX components. The old pins (`snaps-sdk ^4`, `snaps-types ^3.3.0`, which does not exist) are gone.
- Snap permissions: `endowment:transaction-insight`, `endowment:rpc` (dapps only), `endowment:network-access`. No storage, dialogs, keys or provider.
  The old identity-manager handlers and their storage were replaced.
- No severity is set on insights: the SDK's only severity (`critical`) is documented as "should not be submitted", which a trust score cannot justify.
- Mobile SDK: the former app skeleton moved to `mobile-sdk/example-app/` unchanged.

## Not verified

- Whether transaction insights work in stable MetaMask or only in Flask, and whether MetaMask allows the Snap's `fetch` to the
  configured API URL (including plain-HTTP localhost and CORS): not verified here. Test in Flask first (see `metamask-snap/README.md`).
- Component and hook behaviour on a real device or simulator.
- Wallet signing of prepared transactions: not implemented.
- Publishing: neither package is published.
