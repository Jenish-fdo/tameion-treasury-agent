# @credentia/mobile-sdk

TypeScript SDK for React Native apps: check a recipient's trust score, verify credentials, and prepare (never sign or send) a credential issuance.

> Credentia provides explainable trust and AI risk signals before a payment. It does not guarantee transaction safety.
> A trust score or a valid credential is one signal. Only a GO verdict from the Credentia payment check means "safe to proceed".

**Status: not published.** `@credentia/mobile-sdk` is a future package name (the package is `private`). Use local linking, below.
The earlier React Native app skeleton that lived here is preserved, unchanged, in `example-app/` (its dependencies are not installed).

## Operations

| Method | Kind | Backend route |
|---|---|---|
| `checkTrustScore(address)` | read | `GET /api/v1/trust-score/:address` |
| `verifyCredential(credentialId)` | read | `GET /api/v1/credential/:id/verify` |
| `getAgentCredentials(address)` | read | `GET /api/v1/agent/:address/credentials` |
| `mintCredential(params)` | **prepare only** | none (builds calldata locally) |

## Quick start (read-only)

```ts
import { CredentiaSDK } from '@credentia/mobile-sdk'; // future name; see "Local development"

const sdk = new CredentiaSDK({
  apiUrl: 'https://your-credentia-api.example',
  apiKey: undefined, // optional; see the security note
  requestTimeoutMs: 10_000,
});

const score = await sdk.checkTrustScore('0x…');
// { address, score: 47, category: 'LIMITED', breakdown: {...}, lastUpdated, source: 'live' }

const credential = await sdk.verifyCredential('0x…64 hex chars');
// status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NOT_FOUND'  (NOT_FOUND is a normal answer, not an error)

const list = await sdk.getAgentCredentials('0x…');
```

Categories: **0-30 LOW**, **31-60 LIMITED**, **61-100 STRONGER**, **UNKNOWN** for an address that was never scored.
They describe how much evidence exists, not whether a payment is safe.

`breakdown` contains the three factors the on-chain TrustScore contract reports: `credentials`, `attestations`, `staking`
(0-100 points each). `Credential.type` is `"unknown"` where the API does not return a type (the verify endpoint does not).

## React hooks and components

```tsx
import { CredentiaProvider, useTrustScore, TrustScoreBadge, CredentialList } from '@credentia/mobile-sdk';

const sdk = new CredentiaSDK({ apiUrl: '…' }); // create once, outside render

function Recipient({ address }: { address?: string }) {
  const { data, isLoading, error, refetch } = useTrustScore(address); // no request while address is empty/invalid
  if (isLoading) return <Text>Checking…</Text>;
  if (error) return <Text onPress={refetch}>Could not check this recipient. Tap to retry.</Text>;
  return data ? <TrustScoreBadge score={data} /> : null;
}

export default () => <CredentiaProvider sdk={sdk}><Recipient address="0x…" /></CredentiaProvider>;
```

- Hooks return `{ data, isLoading, error, refetch }`, cancel in-flight requests on change or unmount, ignore late results, and cache nothing.
- `TrustScoreBadge` shows the category as text **and** a symbol (▼ ◆ ▲ ?), has an accessible label, and carries the disclaimer. Colour is never the only signal.
- `CredentialList` shows type, issuer, status (text and symbol) and expiry, with an empty state. Loading and error states belong to the parent hook.
- Both accept an optional `theme` and use a deliberately minimal style.

## Prepared credential issuance (does not sign or send)

```ts
const sdk = new CredentiaSDK({ apiUrl: '…', chainId: 10143, registryAddress: '0x…' });

const result = await sdk.mintCredential({ subject: '0x…', credentialType: 'KYC Passed', expiresAt: 0 });
// result.status === 'PREPARED'
// result.preparedTransaction = { to: registry, data: '0x…', value: '0', chainId: 10143 }
```

- The SDK **holds no keys and never signs or broadcasts.** `PREPARED` means unsigned calldata for
  `CredentialRegistry.issueCredential(holder, type, dataHash, expiry)`. It must be signed by a wallet that is an authorised issuer, or the call reverts.
- Without `chainId` and `registryAddress` it returns `UNAVAILABLE` with a message. It never returns a transaction hash or credential ID, because none exists.
- `AWAITING_SIGNATURE`, `SUBMITTED` and `CONFIRMED` exist in the type for wallet integrations to use; **this SDK never returns them.**
- Wallet signing in React Native is **not implemented or tested** here. Hand `preparedTransaction` to your own wallet integration.
- `credentialType` is hashed with keccak256 unless it is already a 32-byte hex value; `metadataUri` (https or ipfs) is hashed into `dataHash`
  (zero hash when absent). Expiry is unix seconds, `0` for none.

## Errors

Every failure is a `CredentiaError` with a `code` and a fixed message: `VALIDATION`, `TIMEOUT`, `NETWORK`, `UNAUTHORIZED` (401/403),
`RATE_LIMITED` (429), `NOT_FOUND` (404), `SERVER` (5xx), `BAD_RESPONSE`, `CANCELLED`. Messages never contain server output, URLs or keys. The SDK never logs.

```ts
import { isCredentiaError } from '@credentia/mobile-sdk';
try { await sdk.checkTrustScore(addr); } catch (e) { if (isCredentiaError(e) && e.code === 'RATE_LIMITED') { /* back off */ } }
```

## Security notes

- An `apiKey` bundled into an app can be extracted by anyone with the app. Use a low-privilege, rate-limited key, or call your own backend.
- Inputs (addresses, credential IDs, expiry, metadata URI) are validated before any request.
- `rpcUrl` is accepted for forward compatibility and is not used by the current operations.

## React Native compatibility

Peer dependencies: `react >= 18.2`, `react-native >= 0.72`. The SDK uses `fetch` and `AbortController` (built in), plus `viem` for calldata only.
The component and hook tests run against a minimal stand-in for React Native's primitives in Node; **they have not been run on a device or
simulator.** Treat on-device behaviour as unverified until you test it in your app.

## Local development

```bash
cd mobile-sdk
pnpm install --ignore-workspace --no-lockfile
pnpm typecheck
pnpm test
pnpm build            # -> dist/

# use it in an app before publishing
pnpm link --global     # here, then in your app: pnpm link --global @credentia/mobile-sdk
# Metro does not follow symlinks by default: add the package folder to `watchFolders` in metro.config.js, or use `npm pack` and install the tarball.
```
