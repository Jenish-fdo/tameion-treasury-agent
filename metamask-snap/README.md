# Credentia MetaMask Snap

Shows public trust signals about a payment recipient on MetaMask's transaction confirmation screen.

> Credentia provides explainable trust and AI risk signals before a payment. It does not guarantee transaction safety.
> A valid credential or a high trust score is not a guarantee. Only a GO verdict from the Credentia payment check means "safe to proceed".

## What it does

- **`onTransaction`**: reads the *unsigned* transaction MetaMask is about to ask you to sign, finds the recipient, and shows:
  trust score, category, number of active credentials, a credential summary, network, and the data timestamp.
  - Native transfer: the recipient is `to`.
  - ERC-20 `transfer` / `transferFrom`: `to` is the token contract, so the recipient is decoded from the calldata.
  - Other contract calls and contract creation: a neutral note; no lookup.
- **`onRpcRequest`**: `credentia_getTrustProfile { address, chainId? }` and `credentia_getVersion`. Anything else is rejected.
- Categories: **0-30 LOW TRUST**, **31-60 LIMITED EVIDENCE**, **61-100 STRONGER EVIDENCE**; an address never scored is **NO TRUST DATA**.
  These describe how much evidence exists, not whether a payment is safe. The wording never says "trusted" or "verified payment".
- **It never blocks, signs, or alters a transaction.** It sets no severity, so MetaMask adds no warning of its own. The only
  severity the SDK offers, `critical`, is documented as "the transaction should not be submitted", which a trust score cannot justify.
- **Every failure is neutral.** If the API is unreachable, slow, rejects the key, rate-limits, returns 5xx, returns malformed data,
  is not configured, or the network is unsupported, the user sees "NO TRUST DATA" / "unavailable for this network", never a score, and the
  message says that missing data is not a sign the recipient is safe.

## Supported networks

Only networks listed in `CREDENTIA_NETWORKS` are evaluated. Default: Monad testnet (`eip155:10143`). Add mainnet explicitly, with the
chain ID you have verified:

```
CREDENTIA_NETWORKS="eip155:10143=Monad Testnet,eip155:143=Monad"
```

## Configuration (build time)

Values are copied into the bundle by `snap.config.ts` and are **readable by anyone who inspects the Snap**. Never put a secret in them.

| Variable | Meaning |
|---|---|
| `CREDENTIA_API_URL` | Base URL of the Credentia API (required for live data) |
| `CREDENTIA_API_KEY` | Optional. Sent as `x-api-key`. Visible in the bundle: use a low-privilege, rate-limited key |
| `CREDENTIA_TIMEOUT_MS` | Request timeout (default 4000) |
| `CREDENTIA_NETWORKS` | Supported networks (see above) |
| `CREDENTIA_DEMO_MODE` | `true` returns clearly labelled DEMO profiles and never calls the API |

The Snap sends only the recipient's public address (in the URL path) to `GET /api/v1/trust-score/:address` and
`GET /api/v1/agent/:address/credentials`. Nothing else from the transaction is sent.

## Permissions

| Permission | Why |
|---|---|
| `endowment:transaction-insight` | Required to show insights on transactions. `allowTransactionOrigin` is not requested: the origin is not used |
| `endowment:rpc` (`dapps: true`, `snaps: false`) | Serves the two read-only RPC methods to dapps |
| `endowment:network-access` | Lets the Snap call the Credentia API with `fetch` |

Not requested: storage, dialogs, notifications, keys or accounts, signing, an Ethereum provider. A test enforces this.

## Versions

- `@metamask/snaps-sdk` **12.0.1** (pinned). 12.1.0 declares platform version 12.1.0, which `mm-snap build` reports as
  unsupported in production MetaMask (maximum 12.0.1), so the SDK is pinned one patch back.
- `@metamask/snaps-cli` 8.4.1, `@metamask/snaps-jest` 10.2.1. The UI uses the SDK's JSX components (`@metamask/snaps-ui` is replaced by it).

## Develop

```bash
cd metamask-snap
pnpm install --ignore-workspace --no-lockfile   # see "Install note"
pnpm typecheck
pnpm test                 # unit tests (handlers, services, manifest)
pnpm build                # -> dist/bundle.js, updates the manifest checksum
pnpm test:integration     # builds in DEMO mode, runs the bundle in the MetaMask Snap simulator, then rebuilds normally
```

**Install note:** a whole-repo `pnpm install` currently fails because of the *old* pins in this package; they are now fixed, so check
whether the workspace install works before relying on `--ignore-workspace`.

## Try it in MetaMask

> Whether transaction insights are available in stable MetaMask, or only in MetaMask Flask, has **not** been verified here.
> Test in [MetaMask Flask](https://docs.metamask.io/snaps/get-started/install-flask/) first.

1. Build in demo mode so no API is needed: `CREDENTIA_DEMO_MODE=true pnpm build && pnpm serve`.
2. From a dapp page, install the Snap: `wallet_requestSnaps({ 'local:http://localhost:8080': {} })`.
3. Start a transaction (a test-network transfer you will **reject**) to an address and read the insight. In demo mode the last hex digit picks the state:

| Recipient ends in | State |
|---|---|
| `0`-`4` | LOW TRUST (18 / 100) |
| `5`-`9` | LIMITED EVIDENCE (47 / 100) |
| `a`-`f` | STRONGER EVIDENCE (78 / 100) |

4. **Unavailable**: build without demo mode and with `CREDENTIA_API_URL` empty or unreachable. **Unsupported network**: send on a chain not in `CREDENTIA_NETWORKS`.
5. **Live data**: build with `CREDENTIA_API_URL` pointing at your Credentia API. Whether MetaMask permits plain-HTTP `localhost` URLs, and the
   API's CORS settings, have not been verified here; use an HTTPS URL if the request is blocked.

Never confirm a test transaction on a network with real funds.

## Security limitations

- A trust score is a weak signal about how much evidence exists. Do not treat any output as permission to pay.
- The Snap sees the unsigned transaction only to extract the recipient; it cannot see your keys and requests no key access.
- Any dapp can call `credentia_getTrustProfile` (read-only). It spends the configured API key's rate limit.
- Anything in the bundle, including `CREDENTIA_API_KEY`, can be read by users.
- Calldata decoding covers ERC-20 `transfer` and `transferFrom` only; other token-like calls show a neutral note.
