# Contributing to Credentia

Thank you for your interest in contributing to Credentia! This document provides guidelines and instructions for contributing.

## 🤝 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/credentia/credentia/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Screenshots if applicable

### Suggesting Features

1. Check [Discussions](https://github.com/credentia/credentia/discussions) for similar ideas
2. Create a new discussion explaining:
   - The problem you're trying to solve
   - Your proposed solution
   - Alternative solutions considered
   - How it benefits the community

### Contributing Code

1. **Fork the Repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/credentia.git
   cd credentia
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

3. **Make Your Changes**
   - Write clean, maintainable code
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   # Run all tests
   pnpm test
   
   # Test specific package
   pnpm --filter @credentia/contracts test
   pnpm --filter @credentia/backend test
   pnpm --filter @credentia/web-app test
   ```

5. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```
   
   Use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting)
   - `refactor:` - Code refactoring
   - `test:` - Test changes
   - `chore:` - Build/tooling changes

6. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   
   Then open a Pull Request on GitHub with:
   - Clear description of changes
   - Link to related issues
   - Screenshots for UI changes
   - Test results

## 📋 Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Redis 7+
- Foundry (for contracts)

### Initial Setup

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Set up database
cd backend
pnpm db:migrate
cd ..

# Deploy contracts locally
cd contracts
forge install
forge build
cd ..
```

### Running Development Servers

```bash
# Run all services
pnpm dev

# Or run individually
pnpm --filter @credentia/backend dev
pnpm --filter @credentia/web-app dev
pnpm --filter @credentia/contracts dev
```

## 🎨 Code Style

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint configuration
- Use Prettier for formatting
- Prefer functional components in React
- Use async/await over promises

### Solidity

- Follow Solidity style guide
- Use NatSpec comments
- Write comprehensive tests
- Optimize for gas efficiency
- Use OpenZeppelin contracts when possible

### Testing

- Write unit tests for all new features
- Integration tests for API endpoints
- Contract tests with Foundry
- Aim for >80% code coverage

## 📝 Documentation

- Update README files for changed packages
- Add JSDoc/NatSpec comments for public APIs
- Update API documentation
- Include examples for new features
- Keep changelog updated

## 🔍 Code Review Process

1. **Automated Checks**
   - All tests must pass
   - Linting must pass
   - TypeScript compilation must succeed
   - No security vulnerabilities

2. **Manual Review**
   - Code quality and maintainability
   - Test coverage
   - Documentation completeness
   - Design patterns

3. **Feedback**
   - Address review comments
   - Update PR based on feedback
   - Request re-review when ready

## 🏗️ Project Structure

```
credentia/
├── contracts/         # Smart contracts (Solidity)
├── backend/          # API server (Node.js/Express)
├── web-app/          # Web application (Next.js)
├── mobile-sdk/       # Mobile SDK (React Native)
├── metamask-snap/    # MetaMask Snap (TypeScript)
├── docs/             # Documentation
└── packages/         # Shared packages (future)
```

## 🚀 Release Process

1. **Version Bump**
   - Update version in package.json files
   - Update CHANGELOG.md
   - Create version tag

2. **Testing**
   - Run full test suite
   - Manual testing on testnet
   - Security review for major releases

3. **Deployment**
   - Deploy contracts to testnet
   - Deploy backend services
   - Deploy frontend applications
   - Publish packages to npm

4. **Announcement**
   - Release notes on GitHub
   - Blog post for major releases
   - Social media announcement
   - Discord announcement

## 🔐 Security

- **Never commit secrets**: Use environment variables
- **Review dependencies**: Check for vulnerabilities
- **Follow best practices**: OWASP, smart contract security
- **Report vulnerabilities**: security@credentia.xyz

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 💬 Communication

- **Discord**: General discussions and support
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Ideas and questions
- **Twitter**: Announcements and updates

## ❓ Questions?

If you have questions about contributing:
- Check existing documentation
- Ask in Discord #dev channel
- Open a GitHub Discussion
- Email: dev@credentia.xyz

Thank you for contributing to Credentia! 🎉
