# Credentia Web App

Next.js 14 web application for Credentia decentralized identity platform.

## 📋 Overview

Modern, responsive web interface for managing decentralized identities, credentials, and attestations on Monad. Built with Next.js 14 App Router, TypeScript, and Tailwind CSS.

## ✨ Features

- **Passkey accounts**: Mera is the whole account layer. No seed phrase, no browser extension, no custody backend
- **Identity Management**: Create and manage DIDs
- **Credential Display**: View and verify credentials
- **Attestation System**: Request and issue attestations
- **AI Agent Support**: Specialized UI for AI agent identities
- **Responsive Design**: Mobile-first, works on all devices
- **Dark Mode**: Theme switching support

## 🏗️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Web3**: viem, Mera passkey accounts (`@category-labs/mera`)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Icons**: Lucide React
- **Validation**: Zod

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local
# Edit .env.local with your configuration

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
web-app/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page
│   │   ├── identity/        # Identity pages
│   │   ├── credentials/     # Credentials pages
│   │   └── api/             # API routes
│   ├── components/          # React components
│   │   ├── ui/              # Base UI components
│   │   ├── layout/          # Layout components
│   │   ├── identity/        # Identity components
│   │   └── wallet/          # Wallet components
│   ├── lib/                 # Utility functions
│   │   ├── monad.ts         # Monad testnet chain settings
│   │   ├── mera.ts          # Passkey account (Mera)
│   │   ├── api.ts           # API client
│   │   └── utils.ts         # Helper functions
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript types
│   └── styles/              # Global styles
├── public/                  # Static assets
└── tailwind.config.ts       # Tailwind configuration
```

## 🎨 Styling

### Tailwind CSS

This project uses Tailwind CSS for styling. Configuration is in `tailwind.config.ts`.

### Component Library

UI components follow a consistent design system with:
- Typography scale
- Color palette
- Spacing system
- Responsive breakpoints

### Dark Mode

Dark mode is supported using Tailwind's dark mode feature.

## 🔌 Web3 Integration

### Accounts

There is no wallet-extension path. `src/lib/mera.ts` derives an account from a passkey and
`src/components/account.tsx` exposes it to the app through `useAccount()`. See "Integration layers" below.

### Smart Contract Interaction

```typescript
import { useIdentityRegistry } from '@/hooks/useIdentityRegistry';

function MyComponent() {
  const { registerIdentity } = useIdentityRegistry();
  // ...
}
```

### Network Configuration

Configured for Monad testnet (Chain ID: 10143). See `src/lib/monad.ts`.

## 📡 API Integration

API calls to the backend use the configured API client:

```typescript
import { api } from '@/lib/api';

const identity = await api.identities.getByDID(did);
```

## 🧪 Development

### Type Checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint
```

### Formatting

```bash
pnpm format
```

### Building

```bash
pnpm build
```

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Configure environment variables
4. Deploy

### Self-Hosted

```bash
# Build
pnpm build

# Start production server
pnpm start
```

### Docker

```bash
# Build image
docker build -t credentia-web .

# Run container
docker run -p 3000:3000 credentia-web
```

## 🔧 Environment Variables

See `.env.example` for all available environment variables.

Required variables:
- `NEXT_PUBLIC_API_URL`: Backend API URL
- `NEXT_PUBLIC_MONAD_CHAIN_ID`: Monad chain ID

## 📱 Responsive Design

The app is fully responsive with breakpoints:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## ♿ Accessibility

- WCAG 2.1 Level AA compliant
- Keyboard navigation support
- Screen reader friendly
- Focus indicators
- Semantic HTML

## 🔐 Security

- Environment variables for sensitive data
- Content Security Policy headers
- XSS protection
- CSRF protection
- Secure API communication

## 🤝 Contributing

1. Follow Next.js best practices
2. Use TypeScript strictly
3. Follow the component structure
4. Write accessible code
5. Test on multiple devices

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details

## Credential flow: issue, share, verify

Routes: `/` (landing), `/issue`, `/verify/[id]`, `/receipt/[id]`, `/dashboard` (credentials issued from this browser).
The earlier payment-evidence story and trust lookup moved to `/payment-story` and `/trust-dashboard`; `/payment-check` and `/credential/*` are unchanged.

How it works:

- A credential's **fingerprint** (`keccak256` of title, recipient name, description and a random salt) is written to `CredentialRegistry.issueCredential(holder, keccak256(title), fingerprint, expiry)` by the **issuer's own passkey account**, signed in the browser tab. No server holds a key.
- The **share link** (`/verify/<id>?d=<payload>`) carries the readable details. The verifier's browser recomputes the fingerprint and the credential ID and compares them with the registry, so edited details show as `DETAILS DO NOT MATCH`. Because the details are in the link, do not put sensitive personal data in them.
- Statuses: `VERIFIED`, `PENDING`, `REVOKED`, `EXPIRED`, `NOT FOUND`, `DETAILS DO NOT MATCH`, `CANNOT CHECK` (registry unreachable), `DEMO · NOT ANCHORED`.
- Issued credentials are listed from this browser's `localStorage`; the registry and the link remain the source of truth.

**Demo mode:** if `NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS` is empty, `/issue` creates clearly labelled demo credentials that never touch a chain and can never show as verified. To anchor on Monad testnet, deploy with `contracts/script/DeployCredentialFlow.s.sol`, set that variable, and issue from a passkey account that the registry owner has authorised and that is CVI-verified.

Libraries added for this flow: `motion`, `lenis` (landing page only, skipped under `prefers-reduced-motion`), `qrcode.react`, `sonner`.

## Integration layers

The core loop is unchanged: **issue → share → verify → receipt**. Four layers sit on top of it. Each one
shows a clear "not configured" or "demo" state when it is not live, and none is needed for the loop to run.

### 1. Cleanverse Verified Identity (CVI): testnet demo stand-in gate

> **Important Notice:** Credentia does **not** have real Cleanverse CVI access and does **not** claim a real Cleanverse integration or bounty eligibility for Cleanverse. The CVI gate and `CviAttestationOracle` are implemented strictly as a testnet demo stand-in / adapter pattern to illustrate how an external identity gate functions on Monad.

- **On-chain gate.** `CredentialRegistry.setCviVerifier(verifier)` switches the gate on. From then on
  `issueCredential` and `issueCredentialWithSig` revert with `IssuerNotCviVerified` unless the issuer passes
  `ICviVerifier.isVerified`. Owner authorisation still applies; an issuer needs both.
- **High-assurance credentials (optional).** `issueHighAssuranceCredential` also requires the *recipient's*
  wallet to be CVI-verified on the testnet stand-in oracle, and marks the credential so verifiers can see it.
- **The verifier behind the gate** is `CviAttestationOracle`: a testnet demo stand-in adapter (not a Cleanverse contract).
  Appointed attesters record the outcome of a demo check for a wallet (verified, tier, expiry, evidence hash; no personal data).
  `ICviVerifier` is the interface seam demonstrating how an external identity verifier can be attached.
- **In the UI.** `/issue` starts with "Step 0 · Verified issuers only" (clearly badged as a testnet demo stand-in)
  and stays locked until the issuer's status allows it. `/verify` and `/receipt` show the issuer's CVI status next to the credential.
  Status is always labelled with words, badges, and stand-in notices: `CVI VERIFIED`, `CVI NOT VERIFIED`, `CVI EXPIRED`, `CVI GATE OFF`.
- **Demo mode** has no registry to ask, so verification can only be *simulated* with a button, and is
  labelled `DEMO · CVI SIMULATED` everywhere. It never appears as `CVI VERIFIED`.

> **No real Cleanverse integration:** There is no integration with Cleanverse's production or sandbox APIs.
> Credentia does not have access to Cleanverse CVI credentials or contract deployments. The attestation oracle
> (`CviAttestationOracle`) is an internal demo stand-in adapter where testnet attestations are written for demonstration only.
> Do not claim or evaluate this as a real Cleanverse integration or bounty submission.

### 2. Mera passkeys: the whole account layer

- `src/lib/mera.ts` creates a passkey, takes its WebAuthn PRF output, derives a BIP-44 Ethereum key from it
  (Mera's documented recipe), and wraps it in a Mera signing session adapted to a viem account.
- Issuing and recording a verification are signed in the tab by that session and sent straight to the
  Monad RPC. No bundler, no relayer, no custody backend, no seed phrase shown or stored.
- Only the credential id is kept in `localStorage`; it holds no key material. "Lock" zeroes the key.
- RainbowKit and wagmi were removed from the web app. Verifying still needs no account at all.
- A new account needs testnet MON for gas (the account menu links the faucet). Passkeys are bound to the
  site's domain: an account made on `localhost` is not the same account on a deployed domain.
- The separate `metamask-snap` workspace package is untouched and is not used by the web app.

### 3. Envio HyperIndex: status, history and reputation from events

`/indexer` is a self-contained HyperIndex v3 project. It indexes `CredentialIssued`, `CredentialRevoked`,
`HighAssuranceCredentialIssued`, `CredentialChecked`, `IssuerAuthorized`, `IssuerRevoked` from the registry
and `IdentityAttested`, `IdentityRevoked` from the CVI oracle into three tables: `Credential`, `Issuer`,
`Activity`.

`CredentialChecked` is new: `recordVerification(id)` lets a verifier leave an on-chain receipt of a check
(the "receipt" step, optional, signed with a passkey). That event is what makes verification count and
history real on-chain data.

With `NEXT_PUBLIC_ENVIO_URL` set, the "On-chain record" panel on `/verify`, the receipts list on `/receipt`
and "Your issuer record" on `/dashboard` show: credential status, verification count, issuer reputation
score (with its breakdown) and recent activity. Without it, counts come straight from the registry and the
panels say that history and reputation need the indexer. In demo mode they show this browser's demo data,
labelled as such.

The reputation score (0-100) is an activity signal, not a trust rating: 40 for a CVI, up to 20 for
credentials issued, up to 20 for verification receipts, up to 20 for the share not revoked
(`src/lib/dc/reputation.ts`, mirrored in the indexer).

```bash
cd indexer
npm install            # Node 22.15+ (24 recommended); not part of the pnpm workspace
cp .env.example .env   # add a free ENVIO_API_TOKEN
# set the two contract addresses and start_block in config.yaml
npm run codegen
npm run dev            # needs Docker; GraphQL at http://localhost:8080/v1/graphql
```

### 4. KIMI Credential Copilot

`src/app/api/copilot/route.ts` is a small tool-calling loop over Moonshot's OpenAI-compatible API
(default model `kimi-k3`). The key stays on the server in `MOONSHOT_API_KEY`.

- **Issuers** (`/issue`): describe what you are certifying; the copilot drafts a title, a description and
  issuance criteria. "Use title and description" fills the form; criteria are for your own process.
- **Verifiers** (`/verify`): "Summarize this credential" and free questions about authenticity. The model
  can only state what its tools return, and the tools return what the page already computed from the
  registry, the CVI verifier and the indexer. It is told that `VERIFIED` means "matches the registry",
  not "the issuer is trustworthy".
- All output appears in an **AI-assisted · KIMI** box with a "may be wrong" note. Without a key the copilot
  shows as offline.

### Deploying the flow

Run by you, with your own signer (no key is read from the environment):

```bash
cd contracts
ISSUER=<your passkey address> forge script script/DeployCredentialFlow.s.sol \
  --rpc-url monad_testnet --broadcast --account <keystore-name>
```

It deploys the registry and the CVI oracle, switches the gate on, and (when `ISSUER` is set) authorises
and attests that address. Put the printed addresses in `web-app/.env.local` and `indexer/config.yaml`.

### Two fixes made along the way

- The web app's ABI declared `issueCredential`'s expiry as `uint256`; the contract takes `uint64`. The
  selector did not match, so anchored issuance could not have worked. Fixed in `src/lib/dc/registry.ts`.
- `getCredential` reverts for an unknown ID, which the app reported as `CANNOT CHECK`. It now reports
  `NOT FOUND`.

### Not yet exercised end to end

Nothing here has been deployed. The passkey ceremony needs a real authenticator; the indexer passes
`envio codegen` and typechecks but has not synced a live contract; the copilot is tested against a mocked
provider, not the real Moonshot API; and the Cleanverse check is a testnet demo stand-in with no real integration (see above).
