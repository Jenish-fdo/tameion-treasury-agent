import type { Address, Hex } from 'viem';
import { reputationScore, type IssuerStats } from './reputation';
import { loadIssued } from './store';

/** One thing that happened to a credential or an issuer, as read from on-chain events. */
export interface ActivityItem {
  kind: 'ISSUED' | 'CHECKED' | 'REVOKED';
  credentialId?: Hex;
  actor: Address;
  /** For CHECKED: what the registry said at that moment. */
  valid?: boolean;
  /** Unix seconds. */
  timestamp: number;
  txHash?: Hex;
}

export interface IssuerRecord extends IssuerStats {
  address: Address;
  score: number;
}

/**
 * Everything the "on-chain record" panel shows for a credential.
 * `source` says where it came from, so the UI never presents demo or partial data as indexed fact:
 *  - envio: the HyperIndex indexer (full history and issuer record)
 *  - chain: direct contract reads (counts only; no history without an indexer)
 *  - demo:  this browser's demo data, nothing on-chain
 */
export interface CredentialInsight {
  source: 'envio' | 'chain' | 'demo';
  verificationCount: number;
  history: ActivityItem[];
  issuer: IssuerRecord | null;
}

export const ACTIVITY_LABEL: Record<ActivityItem['kind'], string> = {
  ISSUED: 'Issued',
  CHECKED: 'Verification recorded',
  REVOKED: 'Revoked',
};

// --- demo mode: receipts recorded in this browser only -----------------------------------------------------------

const DEMO_CHECKS_KEY = 'credentia.checks.demo.v1';
interface DemoCheck {
  id: string;
  at: number;
}

function demoChecks(): DemoCheck[] {
  try {
    const raw = window.localStorage.getItem(DEMO_CHECKS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((c): c is DemoCheck => typeof c?.id === 'string' && typeof c?.at === 'number') : [];
  } catch {
    return [];
  }
}

/** Demo stand-in for CredentialRegistry.recordVerification. Stays in this browser. */
export function recordDemoCheck(id: Hex): void {
  try {
    const next = [...demoChecks(), { id: id.toLowerCase(), at: Math.floor(Date.now() / 1000) }].slice(-300);
    window.localStorage.setItem(DEMO_CHECKS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: nothing to record */
  }
}

export function demoInsight(id: Hex, issuer: Address | undefined): CredentialInsight {
  const checks = demoChecks();
  const mine = checks.filter((c) => c.id === id.toLowerCase());
  const issued = issuer ? loadIssued().filter((e) => e.payload.issuer.toLowerCase() === issuer.toLowerCase()) : [];
  const entry = issued.find((e) => e.id.toLowerCase() === id.toLowerCase());
  const issuedIds = new Set(issued.map((e) => e.id.toLowerCase()));

  const history: ActivityItem[] = [
    ...mine.map((c): ActivityItem => ({ kind: 'CHECKED', credentialId: id, actor: issuer ?? ('0x' as Address), valid: false, timestamp: c.at })),
    ...(entry ? [{ kind: 'ISSUED' as const, credentialId: id, actor: entry.payload.issuer, timestamp: entry.payload.issuedAt }] : []),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const stats: IssuerStats = {
    issued: issued.length,
    revoked: 0,
    checks: checks.filter((c) => issuedIds.has(c.id)).length,
  };
  return {
    source: 'demo',
    verificationCount: mine.length,
    history,
    issuer: issuer ? { address: issuer, ...stats, score: reputationScore(stats) } : null,
  };
}
