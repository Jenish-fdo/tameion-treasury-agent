# Credentia Backend

Node.js + Express + TypeScript API server for Credentia identity platform.

## 📋 Overview

The backend provides REST APIs for:
- Identity management and resolution
- Attestation creation and verification
- Credential issuance and validation
- Trust score computation
- AI agent identity services
- Blockchain indexing and caching

## 🏗️ Architecture

### Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Blockchain**: viem for Monad interaction
- **Validation**: Zod
- **Authentication**: JWT

### Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── types/           # TypeScript types
│   ├── utils/           # Helper functions
│   └── index.ts         # Application entry point
├── prisma/
│   └── schema.prisma    # Database schema
└── tests/               # Test files
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Seed database (optional)
pnpm db:seed
```

### Development

```bash
# Start development server with hot reload
pnpm dev

# Run in production mode
pnpm build
pnpm start
```

The server will start on `http://localhost:3001`

## 📚 API Documentation

### Base URL

```
http://localhost:3001/api/v1
```

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Endpoints

#### Identity Management

- `POST /api/v1/identities` - Register new identity
- `GET /api/v1/identities/:did` - Get identity by DID
- `PUT /api/v1/identities/:did` - Update identity
- `DELETE /api/v1/identities/:did` - Deactivate identity
- `GET /api/v1/identities/address/:address` - Get identity by address

#### Attestations

- `POST /api/v1/attestations` - Create attestation
- `GET /api/v1/attestations/:id` - Get attestation by ID
- `GET /api/v1/attestations/did/:did` - Get attestations for DID
- `POST /api/v1/attestations/:id/verify` - Verify attestation

#### Credentials

- `POST /api/v1/credentials/issue` - Issue credential
- `GET /api/v1/credentials/:id` - Get credential
- `POST /api/v1/credentials/verify` - Verify credential
- `GET /api/v1/credentials/holder/:did` - Get credentials for holder

#### AI Agents

- `POST /api/v1/ai-agents` - Register AI agent
- `GET /api/v1/ai-agents/:did` - Get AI agent details
- `PUT /api/v1/ai-agents/:did/capabilities` - Update capabilities
- `GET /api/v1/ai-agents/:did/trust-score` - Get trust score

#### Health & Status

- `GET /api/v1/health` - Health check
- `GET /api/v1/status` - Service status

## 🔧 Configuration

### Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `NODE_ENV`: Environment (development, production, test)
- `PORT`: Server port
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `MONAD_RPC_URL`: Monad RPC endpoint
- `JWT_SECRET`: Secret for JWT signing

### Database

We use Prisma as the ORM. Schema is defined in `prisma/schema.prisma`.

```bash
# Create migration
pnpm db:migrate

# Generate Prisma client
pnpm db:generate

# Open Prisma Studio
pnpm db:studio
```

### Redis Cache

Redis is used for:
- Session management
- API response caching
- Rate limiting
- Job queues

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## 🔐 Security

### Authentication & Authorization

- JWT-based authentication
- Role-based access control (RBAC)
- API key authentication for service-to-service

### Rate Limiting

API rate limits:
- 100 requests per 15 minutes per IP (general)
- 10 requests per minute for write operations
- 1000 requests per hour for authenticated users

### Data Protection

- All passwords hashed with bcrypt
- Sensitive data encrypted at rest
- HTTPS enforced in production
- CORS configured for trusted origins

## 📊 Monitoring

### Logging

- Winston for structured logging
- Log levels: error, warn, info, debug
- Logs stored in `logs/` directory

### Metrics

- Request/response times
- Error rates
- Database query performance
- Cache hit rates

## 🚀 Deployment

### Production Build

```bash
# Build TypeScript
pnpm build

# Start production server
NODE_ENV=production pnpm start
```

### Docker

```bash
# Build image
docker build -t credentia-backend .

# Run container
docker run -p 3001:3001 --env-file .env credentia-backend
```

### Environment Setup

1. Set `NODE_ENV=production`
2. Configure production database
3. Set secure `JWT_SECRET`
4. Configure CORS for production domain
5. Enable rate limiting
6. Set up monitoring/logging

## 🤝 Contributing

1. Follow TypeScript best practices
2. Write tests for new features
3. Use conventional commits
4. Update API documentation
5. Run linter before committing: `pnpm lint`

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details
