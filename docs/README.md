# Credentia Treasury Autopsy: documentation

Early build. See [`CLEANUP_PLAN.md`](../CLEANUP_PLAN.md) for the roadmap and what has changed so far.

| Document | What it is | Status |
|---|---|---|
| [`architecture.md`](./architecture.md) | Original contract architecture | Historical; rewritten in Phase 7 |
| [`ai-consensus-architecture.md`](./ai-consensus-architecture.md) | How the multi-model risk verdict works (quorum, injection defence, caching) | Current; becomes the risk-engine doc |
| [`api.yaml`](./api.yaml) | OpenAPI for the backend | Current for the credential and intent endpoints; reshaped in Phase 4 |
| [`security-review.md`](./security-review.md) | Security and gas review of the Monad-era contracts | Partly historical; M-1, M-2, M-7 still apply to `CredentialRegistry` |
| [`hosting.md`](./hosting.md) | Deploying the web app to Netlify or Vercel | Current |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`SECURITY.md`](./SECURITY.md) | Contribution and disclosure policy | Generic; to review |
