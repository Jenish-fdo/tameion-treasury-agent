/**
 * Issuer reputation score, 0-100. It is an ACTIVITY SIGNAL computed from on-chain events, not a
 * judgement of trustworthiness: it says how much an issuer has issued, how often what they issued
 * gets checked, how rarely they revoke, and whether they hold a testnet demo stand-in Cleanverse Verified Identity.
 *
 * The indexer (indexer/src/handlers/Credentia.ts) computes the same formula. Keep the two in step.
 */
export interface IssuerStats {
  issued: number;
  revoked: number;
  /** On-chain verification receipts across everything this issuer issued. */
  checks: number;
  cviVerified: boolean;
}

export interface ReputationPart {
  label: string;
  points: number;
  max: number;
}

export function reputationParts(s: IssuerStats): ReputationPart[] {
  const kept = s.issued === 0 ? 0 : Math.round(20 * (1 - s.revoked / s.issued));
  return [
    { label: 'Cleanverse Verified Identity (testnet stand-in)', points: s.cviVerified ? 40 : 0, max: 40 },
    { label: 'Credentials issued', points: Math.min(s.issued, 20), max: 20 },
    { label: 'Verifications recorded', points: Math.min(s.checks * 2, 20), max: 20 },
    { label: 'Credentials kept (not revoked)', points: kept, max: 20 },
  ];
}

export function reputationScore(s: IssuerStats): number {
  return reputationParts(s).reduce((sum, p) => sum + p.points, 0);
}
