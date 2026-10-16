# REST API Reference

Base URL: `https://api.credentia.xyz/api/v1`

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### Health & Status

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-08T12:00:00Z",
  "uptime": 3600
}
```

---

### Identities

#### POST /identities
Create a new identity (DID).

**Request:**
```json
{
  "did": "did:credentia:abc123",
  "didDocument": "{...}",
  "isAIAgent": false
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "did": "did:credentia:abc123",
    "owner": "0x123...",
    "didDocument": "{...}",
    "isAIAgent": false,
    "createdAt": "2026-10-08T12:00:00Z"
  }
}
```

#### GET /identities/:did
Get identity by DID.

**Response:**
```json
{
  "status": "success",
  "data": {
    "did": "did:credentia:abc123",
    "owner": "0x123...",
    "didDocument": "{...}",
    "isActive": true,
    "isAIAgent": false,
    "createdAt": "2026-10-08T12:00:00Z"
  }
}
```

#### PUT /identities/:did
Update identity DID document.

**Request:**
```json
{
  "didDocument": "{...new document...}"
}
```

#### DELETE /identities/:did
Deactivate an identity.

**Response:**
```json
{
  "status": "success",
  "message": "Identity deactivated successfully"
}
```

#### GET /identities/address/:address
Get identity by wallet address.

**Response:**
```json
{
  "status": "success",
  "data": {
    "did": "did:credentia:abc123",
    "owner": "0x123..."
  }
}
```

---

### Credentials

#### POST /credentials/issue
Issue a new credential.

**Request:**
```json
{
  "holder": "did:credentia:abc123",
  "type": "EmailVerification",
  "credentialSubject": {
    "email": "user@example.com",
    "verified": true
  },
  "expirationDate": "2027-10-08T12:00:00Z"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "cred_123",
    "type": "EmailVerification",
    "issuer": "did:credentia:issuer",
    "holder": "did:credentia:abc123",
    "issuanceDate": "2026-10-08T12:00:00Z",
    "proof": {
      "type": "EcdsaSecp256k1Signature2019",
      "signature": "0x..."
    }
  }
}
```

#### GET /credentials/:id
Get credential by ID.

#### POST /credentials/verify
Verify a credential.

**Request:**
```json
{
  "credential": {...}
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "valid": true,
    "issuer": "did:credentia:issuer",
    "revoked": false
  }
}
```

#### GET /credentials/holder/:did
Get all credentials for a holder.

**Response:**
```json
{
  "status": "success",
  "data": {
    "credentials": [...]
  }
}
```

---

### Attestations

#### POST /attestations
Create a new attestation.

**Request:**
```json
{
  "subject": "did:credentia:abc123",
  "schema": "reputation",
  "data": {
    "score": 95,
    "category": "developer"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "att_123",
    "issuer": "did:credentia:issuer",
    "subject": "did:credentia:abc123",
    "schema": "reputation",
    "data": {...},
    "signature": "0x...",
    "timestamp": "2026-10-08T12:00:00Z"
  }
}
```

#### GET /attestations/:id
Get attestation by ID.

#### GET /attestations/did/:did
Get all attestations for a DID.

#### POST /attestations/:id/verify
Verify an attestation.

---

### AI Agents

#### POST /ai-agents
Register an AI agent.

**Request:**
```json
{
  "did": "did:credentia:agent123",
  "capabilities": ["text-generation", "code-review"],
  "metadata": {
    "model": "gpt-4",
    "version": "1.0"
  }
}
```

#### GET /ai-agents/:did
Get AI agent details.

#### PUT /ai-agents/:did/capabilities
Update agent capabilities.

#### GET /ai-agents/:did/trust-score
Get agent trust score.

---

## Error Responses

### 400 Bad Request
```json
{
  "status": "error",
  "message": "Validation error",
  "errors": [
    {
      "path": "didDocument",
      "message": "Invalid DID document format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "status": "error",
  "message": "Authentication required"
}
```

### 404 Not Found
```json
{
  "status": "error",
  "message": "Identity not found"
}
```

### 500 Internal Server Error
```json
{
  "status": "error",
  "message": "Internal server error"
}
```

## Rate Limiting

- **General**: 100 requests per 15 minutes per IP
- **Write operations**: 10 requests per minute
- **Authenticated users**: 1000 requests per hour

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634567890
```

## Pagination

List endpoints support pagination:

```
GET /credentials?page=1&limit=20
```

Response:
```json
{
  "status": "success",
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Webhooks

Subscribe to events:

```
POST /webhooks
{
  "url": "https://your-app.com/webhook",
  "events": ["identity.created", "credential.issued"]
}
```

Webhook payload:
```json
{
  "event": "identity.created",
  "timestamp": "2026-10-08T12:00:00Z",
  "data": {...}
}
```
