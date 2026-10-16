import type { CredentialSummary, LookupResult, SnapConfig, TrustProfile, UnavailableReason } from '../types/trust';
import { supportedNetworkName } from '../utils/chain';
import { categorize } from '../utils/score';
import { isHexAddress, normalizeAddress } from '../utils/transaction';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

class ApiFailure extends Error {
  constructor(public readonly reason: UnavailableReason) {
    super(reason);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sec = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined);

function reasonForStatus(status: number): UnavailableReason {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'bad_response'; // other 4xx (including 404/400) are not evidence about the recipient
}

async function getJson(cfg: SnapConfig, path: string, fetchImpl: FetchLike): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, cfg.timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
    let res;
    try {
      res = await fetchImpl(`${cfg.apiUrl.replace(/\/+$/, '')}${path}`, { method: 'GET', headers, signal: controller.signal });
    } catch {
      throw new ApiFailure(timedOut ? 'timeout' : 'network');
    }
    if (!res.ok) throw new ApiFailure(reasonForStatus(res.status));
    try {
      return await res.json();
    } catch {
      throw new ApiFailure('bad_response');
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Validates the trust-score payload. Throws ApiFailure('bad_response') on anything unexpected. */
export function normalizeTrust(raw: unknown, expectedAddress: string): Pick<TrustProfile, 'score' | 'category' | 'updatedAt'> {
  if (!isRecord(raw) || typeof raw.score !== 'number' || !Number.isFinite(raw.score) || !isHexAddress(raw.address) || normalizeAddress(raw.address) !== expectedAddress) {
    throw new ApiFailure('bad_response');
  }
  const score = Math.min(100, Math.max(0, raw.score));
  const updatedAt = sec(raw.lastUpdated);
  return { score, category: categorize(score, updatedAt !== undefined || score > 0), updatedAt };
}

export function normalizeCredentials(raw: unknown, nowSec: number = Math.floor(Date.now() / 1000)): CredentialSummary[] {
  if (!isRecord(raw) || !Array.isArray(raw.credentials)) throw new ApiFailure('bad_response');
  return raw.credentials.slice(0, 50).map((c): CredentialSummary => {
    if (!isRecord(c) || typeof c.credentialId !== 'string' || !isHexAddress(c.issuer)) throw new ApiFailure('bad_response');
    const expiresAt = sec(c.expiresAt);
    return {
      id: c.credentialId,
      type: typeof c.credentialType === 'string' && c.credentialType ? c.credentialType.slice(0, 64) : 'unknown',
      issuer: c.issuer,
      status: c.isRevoked === true ? 'REVOKED' : expiresAt !== undefined && expiresAt <= nowSec ? 'EXPIRED' : 'ACTIVE',
      expiresAt,
    };
  });
}

/** Deterministic, clearly-labelled demo profiles for manual testing (DEMO mode only). Last hex digit picks the state. */
export function demoProfile(address: string): TrustProfile {
  const d = parseInt(address.slice(-1), 16);
  const [score, count] = d <= 4 ? [18, 0] : d <= 9 ? [47, 1] : [78, 3];
  return { address, score, category: categorize(score, true), activeCredentialCount: count, updatedAt: 1_790_000_000, source: 'demo' };
}

/**
 * Looks up a recipient. Sends ONLY the public recipient address (in the URL path); nothing from the transaction
 * itself. Every failure becomes an `unavailable` result, never a trust signal.
 */
export async function lookupTrustProfile(
  cfg: SnapConfig, address: string, chainId: string, fetchImpl: FetchLike, nowSec?: number
): Promise<LookupResult> {
  if (!isHexAddress(address)) return { kind: 'invalid-address' };
  const network = supportedNetworkName(chainId, cfg.networks);
  if (network === null) return { kind: 'unsupported-network', chainId: typeof chainId === 'string' ? chainId.slice(0, 40) : '' };
  const a = normalizeAddress(address);

  if (cfg.demoMode) return { kind: 'ok', profile: demoProfile(a), network };
  if (!cfg.apiUrl) return { kind: 'unavailable', reason: 'not_configured', network };

  try {
    const [trustRaw, credsResult] = await Promise.all([
      getJson(cfg, `/api/v1/trust-score/${a}`, fetchImpl),
      getJson(cfg, `/api/v1/agent/${a}/credentials`, fetchImpl).then(
        (raw) => ({ ok: true as const, raw }),
        () => ({ ok: false as const }) // credentials are optional detail: the score can still be shown
      ),
    ]);
    const trust = normalizeTrust(trustRaw, a);
    let credentials: CredentialSummary[] | undefined;
    if (credsResult.ok) {
      try {
        credentials = normalizeCredentials(credsResult.raw, nowSec);
      } catch {
        credentials = undefined;
      }
    }
    return {
      kind: 'ok', network,
      profile: {
        address: a, ...trust, credentials,
        activeCredentialCount: credentials ? credentials.filter((c) => c.status === 'ACTIVE').length : null,
        source: 'live',
      },
    };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof ApiFailure ? e.reason : 'bad_response', network };
  }
}
