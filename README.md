# Credentia

> Portable Identity & Trust Layer for AI Agents and Humans on Monad

Credentia is a decentralized identity and reputation system built on Monad, designed to provide portable, verifiable credentials for both AI agents and human users. It enables trust-based interactions across Web3 applications through on-chain attestations, verifiable credentials, and composable identity primitives.

## 🌟 Features

- **Portable Identity**: Self-sovereign identity that works across platforms and applications
- **Trust Layer**: On-chain reputation and attestation system
- **AI Agent Support**: Purpose-built credentials and trust mechanisms for autonomous AI agents
- **Monad-Optimized**: Leverages Monad's high-performance L1 for scalable identity operations
- **Privacy-First**: Zero-knowledge proofs for selective disclosure
- **Cross-Platform**: Web, mobile, and MetaMask Snap integration

## 📦 Monorepo Structure

```
credentia/
├── contracts/         # Solidity smart contracts (Foundry)
├── backend/          # Node.js + Express API server
├── web-app/          # Next.js 14 web application
├── mobile-sdk/       # React Native mobile SDK
├── metamask-snap/    # MetaMask Snap extension
└── docs/             # Documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and pnpm
- Foundry (for smart contracts)
- Monad testnet access (Chain ID: 10143)

### Installation

```bash
# Install dependencies for all packages
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Build all packages
pnpm build
```

### Development

```bash
# Run all services in development mode
pnpm dev

# Run specific package
pnpm --filter @credentia/contracts dev
pnpm --filter @credentia/backend dev
pnpm --filter @credentia/web-app dev
```

## 📚 Package Documentation

- **[Contracts](/contracts/README.md)**: Smart contract documentation and deployment guides
- **[Backend](/backend/README.md)**: API server setup and endpoints
- **[Web App](/web-app/README.md)**: Next.js application documentation
- **[Mobile SDK](/mobile-sdk/README.md)**: React Native SDK integration guide
- **[MetaMask Snap](/metamask-snap/README.md)**: Snap development and installation
- **[Docs](/docs/README.md)**: Comprehensive project documentation

## 🏗️ Architecture

Credentia uses a layered architecture:

1. **Smart Contracts Layer**: Core identity and attestation logic on Monad
2. **Backend Layer**: API server for indexing, caching, and off-chain operations
3. **Client Layer**: Web and mobile interfaces for users
4. **Integration Layer**: MetaMask Snap for wallet-native identity management

## 🧩 Integration layers (credential flow)

The web app's issue → share → verify → receipt flow carries four optional layers:
a Cleanverse Verified Identity gate (strictly a testnet demo stand-in adapter; no real Cleanverse integration or bounty eligibility is claimed), Mera passkeys as the account layer, an Envio HyperIndex
indexer (`/indexer`) providing status, history and issuer reputation, and a KIMI copilot helping draft and
read credentials. Details, limits and stand-in notices are documented in
[web-app/README.md](./web-app/README.md#integration-layers).

## 🔗 Monad Testnet

- **Chain ID**: 10143
- **RPC**: Configure in your `.env` file
- **Explorer**: Link to Monad testnet explorer

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🔐 Security

Please report security vulnerabilities to security@credentia.xyz. See [SECURITY.md](./docs/SECURITY.md) for our security policy.

## 📞 Contact & Community

- **Website**: https://credentia.xyz
- **Twitter**: @CredentiaXYZ
- **Discord**: [Join our community](https://discord.gg/credentia)
- **Documentation**: https://docs.credentia.xyz

## 🗺️ Roadmap

- [x] Core identity contracts
- [x] Attestation system
- [ ] ZK credential proofs
- [ ] AI agent credential standards
- [ ] Cross-chain identity bridges
- [ ] Mobile SDK v1
- [ ] MetaMask Snap integration

---

Built with ❤️ for the Monad ecosystem
