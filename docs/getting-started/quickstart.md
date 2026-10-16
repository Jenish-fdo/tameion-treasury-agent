# Quick Start Guide

Get started with Credentia in just a few minutes.

## Prerequisites

- Node.js 20+
- pnpm
- MetaMask or compatible Web3 wallet
- Monad testnet tokens (get from faucet)

## 1. Clone the Repository

```bash
git clone https://github.com/credentia/credentia.git
cd credentia
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Configure Environment

```bash
# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env
cp web-app/.env.example web-app/.env.local

# Edit .env files with your configuration
```

Required configuration:
- `MONAD_RPC_URL`: Monad testnet RPC endpoint
- `DATABASE_URL`: PostgreSQL connection string
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: WalletConnect project ID

## 4. Deploy Smart Contracts

```bash
# Navigate to contracts
cd contracts

# Deploy to Monad testnet
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $MONAD_RPC_URL \
  --broadcast \
  --verify

# Save the deployed contract addresses
```

Update your `.env` files with the deployed contract addresses.

## 5. Set Up Database

```bash
# Navigate to backend
cd backend

# Run migrations
pnpm db:migrate

# Optionally seed data
pnpm db:seed
```

## 6. Start Services

### Backend API

```bash
cd backend
pnpm dev
```

The API will be available at `http://localhost:3001`

### Web Application

```bash
cd web-app
pnpm dev
```

The web app will be available at `http://localhost:3000`

## 7. Create Your First Identity

### Using the Web App

1. Open `http://localhost:3000`
2. Click "Connect Wallet"
3. Navigate to "Identity" page
4. Click "Create Identity"
5. Confirm the transaction

### Using the API

```bash
curl -X POST http://localhost:3001/api/v1/identities \
  -H "Content-Type: application/json" \
  -d '{
    "did": "did:credentia:test123",
    "didDocument": "{}",
    "isAIAgent": false
  }'
```

### Using JavaScript SDK

```javascript
import { CredentiaClient } from '@credentia/sdk';

const client = new CredentiaClient({
  apiUrl: 'http://localhost:3001',
  chainId: 10143,
});

// Create identity
const identity = await client.createIdentity({
  didDocument: {
    '@context': 'https://www.w3.org/ns/did/v1',
    publicKey: [...],
  },
  isAIAgent: false,
});

console.log('Identity created:', identity.did);
```

## 8. Issue Your First Credential

```javascript
// Issue a credential
const credential = await client.issueCredential({
  holder: identity.did,
  type: 'EmailVerification',
  credentialSubject: {
    email: 'user@example.com',
    verified: true,
  },
});

console.log('Credential issued:', credential.id);
```

## 9. Create an Attestation

```javascript
// Create attestation
const attestation = await client.createAttestation({
  subject: identity.did,
  schema: 'reputation',
  data: {
    score: 95,
    category: 'developer',
  },
});

console.log('Attestation created:', attestation.id);
```

## Next Steps

Now that you have the basics working:

1. **Explore the Web App**: Browse identities, credentials, and attestations
2. **Read the Guides**: Learn about [credentials](../guides/credentials.md) and [attestations](../guides/attestations.md)
3. **Integrate Your App**: Use the [SDK Reference](../api/sdk-reference.md)
4. **Deploy to Production**: Follow the [Deployment Guide](../contracts/deployment.md)

## Common Issues

### Contract Deployment Fails

- Ensure you have testnet tokens
- Check your RPC URL is correct
- Verify your private key has funds

### Database Connection Error

- Ensure PostgreSQL is running
- Check your `DATABASE_URL` is correct
- Verify database exists

### Web App Won't Connect

- Clear browser cache
- Check MetaMask is on Monad testnet
- Verify contract addresses in `.env.local`

## Support

Need help? 
- [Discord Community](https://discord.gg/credentia)
- [GitHub Issues](https://github.com/credentia/credentia/issues)
- [Documentation](../README.md)
