import { indexer } from "envio";

/**
 * Credentia event handlers.
 *
 * Three views are kept current from CredentialRegistry and CviAttestationOracle events:
 *   Credential  real-time status of each credential and how often it has been checked
 *   Issuer      per-issuer counts, Cleanverse CVI state (testnet demo stand-in) and the reputation score
 *   Activity    the append-only feed behind verification history and recent activity
 */

const lower = (value: string) => value.toLowerCase();
const logId = (chainId: number, block: number, logIndex: number) => `${chainId}_${block}_${logIndex}`;

type IssuerRow = {
  id: string;
  authorized: boolean;
  issued: number;
  revoked: number;
  checks: number;
  cviVerified: boolean;
  cviTier: number;
  cviExpiresAt: number;
  score: number;
};

const newIssuer = (id: string): IssuerRow => ({
  id,
  authorized: false,
  issued: 0,
  revoked: 0,
  checks: 0,
  cviVerified: false,
  cviTier: 0,
  cviExpiresAt: 0,
  score: 0,
});

/**
 * 0-100 activity signal, not a trust rating. Keep in step with web-app/src/lib/dc/reputation.ts:
 * 40 for a Cleanverse Verified Identity (testnet demo stand-in), up to 20 for credentials issued, up to 20 for verification
 * receipts (2 each), up to 20 for the share of credentials not revoked.
 */
function withScore(issuer: IssuerRow): IssuerRow {
  const kept = issuer.issued === 0 ? 0 : Math.round(20 * (1 - issuer.revoked / issuer.issued));
  const score = (issuer.cviVerified ? 40 : 0) + Math.min(issuer.issued, 20) + Math.min(issuer.checks * 2, 20) + kept;
  return { ...issuer, score };
}

// ── CredentialRegistry ─────────────────────────────────────────────

indexer.onEvent({ contract: "CredentialRegistry", event: "CredentialIssued" }, async ({ event, context }) => {
  const id = lower(event.params.id);
  const issuerId = lower(event.params.issuer);

  context.Credential.set({
    id,
    issuer: issuerId,
    holder: lower(event.params.holder),
    credentialType: event.params.credentialType,
    issuedAt: event.block.timestamp,
    expiryTimestamp: event.params.expiryTimestamp,
    revoked: false,
    revokedAt: undefined,
    highAssurance: false,
    checkCount: 0,
    lastCheckedAt: undefined,
    txHash: event.transaction.hash,
  });

  const issuer = (await context.Issuer.get(issuerId)) ?? newIssuer(issuerId);
  context.Issuer.set(withScore({ ...issuer, issued: issuer.issued + 1 }));

  context.Activity.set({
    id: logId(event.chainId, event.block.number, event.logIndex),
    kind: "ISSUED",
    credential: id,
    issuer: issuerId,
    actor: issuerId,
    valid: undefined,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

// Emitted right after CredentialIssued in the same transaction, so the row already exists.
indexer.onEvent({ contract: "CredentialRegistry", event: "HighAssuranceCredentialIssued" }, async ({ event, context }) => {
  const credential = await context.Credential.get(lower(event.params.id));
  if (credential) context.Credential.set({ ...credential, highAssurance: true });
});

indexer.onEvent({ contract: "CredentialRegistry", event: "CredentialRevoked" }, async ({ event, context }) => {
  const id = lower(event.params.id);
  const credential = await context.Credential.get(id);
  if (!credential) return;

  context.Credential.set({ ...credential, revoked: true, revokedAt: event.block.timestamp });

  const issuer = await context.Issuer.get(credential.issuer);
  if (issuer) context.Issuer.set(withScore({ ...issuer, revoked: issuer.revoked + 1 }));

  context.Activity.set({
    id: logId(event.chainId, event.block.number, event.logIndex),
    kind: "REVOKED",
    credential: id,
    issuer: credential.issuer,
    actor: lower(event.params.revokedBy),
    valid: undefined,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

// A verifier left an on-chain receipt of a check: the source of verification count and history.
indexer.onEvent({ contract: "CredentialRegistry", event: "CredentialChecked" }, async ({ event, context }) => {
  const id = lower(event.params.id);
  const credential = await context.Credential.get(id);
  if (!credential) return;

  context.Credential.set({
    ...credential,
    checkCount: credential.checkCount + 1,
    lastCheckedAt: event.block.timestamp,
  });

  const issuer = await context.Issuer.get(credential.issuer);
  if (issuer) context.Issuer.set(withScore({ ...issuer, checks: issuer.checks + 1 }));

  context.Activity.set({
    id: logId(event.chainId, event.block.number, event.logIndex),
    kind: "CHECKED",
    credential: id,
    issuer: credential.issuer,
    actor: lower(event.params.verifier),
    valid: event.params.valid,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "CredentialRegistry", event: "IssuerAuthorized" }, async ({ event, context }) => {
  const id = lower(event.params.issuer);
  const issuer = (await context.Issuer.get(id)) ?? newIssuer(id);
  context.Issuer.set({ ...issuer, authorized: true });
});

indexer.onEvent({ contract: "CredentialRegistry", event: "IssuerRevoked" }, async ({ event, context }) => {
  const id = lower(event.params.issuer);
  const issuer = (await context.Issuer.get(id)) ?? newIssuer(id);
  context.Issuer.set({ ...issuer, authorized: false });
});

// ── CviAttestationOracle ───────────────────────────────────────────

indexer.onEvent({ contract: "CviAttestationOracle", event: "IdentityAttested" }, async ({ event, context }) => {
  const id = lower(event.params.wallet);
  const issuer = (await context.Issuer.get(id)) ?? newIssuer(id);
  context.Issuer.set(
    withScore({
      ...issuer,
      cviVerified: true,
      cviTier: Number(event.params.tier),
      cviExpiresAt: Number(event.params.expiresAt),
    }),
  );

  context.Activity.set({
    id: logId(event.chainId, event.block.number, event.logIndex),
    kind: "CVI_ATTESTED",
    credential: undefined,
    issuer: id,
    actor: lower(event.params.attester),
    valid: undefined,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "CviAttestationOracle", event: "IdentityRevoked" }, async ({ event, context }) => {
  const id = lower(event.params.wallet);
  const issuer = (await context.Issuer.get(id)) ?? newIssuer(id);
  context.Issuer.set(withScore({ ...issuer, cviVerified: false }));

  context.Activity.set({
    id: logId(event.chainId, event.block.number, event.logIndex),
    kind: "CVI_REVOKED",
    credential: undefined,
    issuer: id,
    actor: lower(event.params.attester),
    valid: undefined,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});
