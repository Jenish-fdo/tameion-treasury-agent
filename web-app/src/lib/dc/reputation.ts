/**
 * Issuer reputation score, 0-100. It is an ACTIVITY SIGNAL computed from on-chain events, not a
 * judgement of trustworthiness: it says how much an issuer has issued, how often what they issued
 * gets checked, and how rarely they revoke.
 */
export interface IssuerStats {
  issued: number;
  revoked: number;
  /** On-chain verification receipts across everything this issuer issued. */
  checks: number;
}

export interface ReputationPart {
  label: string;
  points: number;
  max: number;
}

export function reputationParts(s: IssuerStats): ReputationPart[] {
  const kept = s.issued === 0 ? 0 : Math.round(30 * (1 - s.revoked / s.issued));
  return [
    { label: 'Credentials issued', points: Math.min(s.issued * 2, 40), max: 40 },
    { label: 'Verifications recorded', points: Math.min(s.checks * 3, 30), max: 30 },
    { label: 'Credentials kept (not revoked)', points: kept, max: 30 },
  ];
}

export function reputationScore(s: IssuerStats): number {
  return reputationParts(s).reduce((sum, p) => sum + p.points, 0);
}
