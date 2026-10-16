# System Architecture Overview

Credentia is built as a modular, scalable decentralized identity platform with multiple layers working together.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Web App    │  │  Mobile SDK  │  │  MetaMask Snap   │  │
│  │  (Next.js)   │  │   (React     │  │   (TypeScript)   │  │
│  │              │  │    Native)   │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────┬────────────────┬────────────────┬──────────────┘
             │                │                │
             │  REST API      │  REST API      │  RPC Calls
             ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend Services                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           API Server (Node.js + Express)             │   │
│  │  • Identity Management  • Credential Issuance        │   │
│  │  • Attestation Service  • Trust Score Calculation    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐    │
│  │  PostgreSQL  │  │    Redis     │  │  IPFS/Pinata  │    │
│  │  (Database)  │  │   (Cache)    │  │   (Storage)   │    │
│  └──────────────┘  └──────────────┘  └───────────────┘    │
└────────────┬────────────────────────────────────────────────┘
             │  Web3 Provider (viem)
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Monad Blockchain (L1)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Smart Contracts (Solidity)              │   │
│  │  ┌─────────────────┐  ┌────────────────────────┐    │   │
│  │  │ IdentityRegistry│  │ AttestationRegistry    │    │   │
│  │  └─────────────────┘  └────────────────────────┘    │   │
│  │  ┌─────────────────┐  ┌────────────────────────┐    │   │
│  │  │CredentialIssuer │  │   TrustScore           │    │   │
│  │  └─────────────────┘  └────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Smart Contracts Layer

**Purpose**: On-chain identity registry and attestation system

**Components**:
- **IdentityRegistry**: Manages DIDs and ownership
- **AttestationRegistry**: Issues and verifies attestations
- **CredentialIssuer**: Issues verifiable credentials
- **TrustScore**: Calculates reputation scores
- **AccessControl**: Role-based permissions

**Technology**: Solidity 0.8.24, Foundry, OpenZeppelin

**Key Features**:
- Gas-optimized operations
- Upgradeable via proxy pattern
- Event emission for indexing
- Role-based access control

### 2. Backend Services Layer

**Purpose**: API server, indexing, and off-chain operations

**Components**:
- **API Server**: REST endpoints for clients
- **Indexer**: Monitors blockchain events
- **Cache Layer**: Redis for performance
- **Database**: PostgreSQL for structured data
- **Storage**: IPFS for large documents

**Technology**: Node.js, Express, TypeScript, Prisma, viem

**Key Features**:
- JWT authentication
- Rate limiting
- Request validation
- Error handling
- Logging and monitoring

### 3. Client Applications Layer

**Purpose**: User interfaces and integrations

**Components**:
- **Web App**: Browser-based interface (Next.js 14)
- **Mobile SDK**: Native mobile apps (React Native)
- **MetaMask Snap**: Wallet integration

**Technology**: React, Next.js, React Native, TypeScript, wagmi

**Key Features**:
- Wallet connectivity
- Real-time updates
- Responsive design
- Offline support (mobile)

## Data Flow

### Creating an Identity

```
1. User initiates → Web App/Mobile
2. Sign transaction → MetaMask/Wallet
3. Transaction sent → Monad Blockchain
4. Contract emits event → IdentityRegistry
5. Backend indexes event → API Server
6. Store in database → PostgreSQL
7. Cache result → Redis
8. Return to client → Web App/Mobile
```

### Issuing a Credential

```
1. Issuer creates credential → Backend API
2. Generate proof → Crypto library
3. Store credential → IPFS
4. Save metadata → PostgreSQL
5. Optional: Register on-chain → Smart Contract
6. Notify holder → Push notification
7. Holder retrieves → Mobile/Web/Snap
```

### Verifying an Attestation

```
1. Request verification → Client App
2. Fetch attestation → Backend API/Blockchain
3. Verify signature → Crypto verification
4. Check revocation → On-chain lookup
5. Validate timestamp → Expiry check
6. Return result → Client App
```

## Security Architecture

### Defense in Depth

1. **Smart Contract Layer**
   - Audited contracts
   - Access controls
   - Reentrancy protection
   - Timelocked upgrades

2. **Backend Layer**
   - Input validation
   - Rate limiting
   - SQL injection prevention
   - XSS protection

3. **Client Layer**
   - Content Security Policy
   - Secure storage
   - HTTPS only
   - Wallet security

### Authentication & Authorization

```
User → Wallet Signature → JWT Token → API Access
                            ↓
                     Role-Based Access
                            ↓
                    Permission Checks
```

## Scalability

### Horizontal Scaling

- **API Servers**: Load balanced instances
- **Database**: Read replicas
- **Cache**: Redis cluster
- **Storage**: IPFS distributed

### Performance Optimizations

- **Caching**: Redis for hot data
- **Indexing**: Database indexes on keys
- **CDN**: Static assets on edge
- **Lazy Loading**: On-demand data fetching

### Monad Benefits

- **High TPS**: 10,000+ transactions per second
- **Low Latency**: Sub-second finality
- **Low Fees**: Minimal gas costs
- **EVM Compatible**: Standard Solidity

## Deployment Architecture

### Development
```
Local Machine
├── Local Blockchain (Anvil)
├── Local PostgreSQL
├── Local Redis
└── Development Servers
```

### Staging
```
Testnet Environment
├── Monad Testnet
├── Managed PostgreSQL
├── Managed Redis
└── Staging Servers
```

### Production
```
Mainnet Environment
├── Monad Mainnet
├── High-Availability PostgreSQL
├── Redis Cluster
├── Load-Balanced Servers
└── CDN (Cloudflare/AWS)
```

## Monitoring & Observability

### Metrics
- API response times
- Transaction success rates
- Database query performance
- Cache hit rates
- Error rates

### Logging
- Structured JSON logs
- Log aggregation (ELK/Datadog)
- Alert on errors
- Audit trails

### Monitoring
- Uptime monitoring
- Performance monitoring
- Security monitoring
- Smart contract monitoring

## Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| Blockchain | Monad (EVM) |
| Smart Contracts | Solidity 0.8.24, Foundry |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Cache | Redis |
| Storage | IPFS, Pinata |
| Web Frontend | Next.js 14, React, Tailwind CSS |
| Mobile | React Native 0.74 |
| Wallet Integration | wagmi, viem, RainbowKit |
| Testing | Foundry, Jest, Vitest |
| CI/CD | GitHub Actions |

## Future Enhancements

- Zero-knowledge proof integration
- Cross-chain identity bridges
- Enhanced AI agent features
- Decentralized storage layer
- Advanced privacy features

## Next Steps

- [Smart Contracts Architecture](./contracts.md)
- [Backend Architecture](./backend.md)
- [Frontend Architecture](./frontend.md)
- [Data Flow Details](./data-flow.md)
