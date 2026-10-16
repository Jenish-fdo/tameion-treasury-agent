import type { TrustScore, TrustScoreCategory } from '../types';
import { CredentiaError } from '../utils/errors';
import { assertAddress, isAddress } from '../utils/validation';
import type { HttpClient } from './client';

/** 0-30 LOW, 31-60 LIMITED, 61-100 STRONGER. These describe how much evidence exists, not safety. */
export function categorize(score: number, scored: boolean): TrustScoreCategory {
  if (!scored) return 'UNKNOWN';
  const s = Math.round(score);
  return s <= 30 ? 'LOW' : s <= 60 ? 'LIMITED' : 'STRONGER';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const points = (v: unknown): number | undefined => (isRecord(v) && typeof v.points === 'number' && Number.isFinite(v.points) ? Math.min(100, Math.max(0, v.points)) : undefined);

/** Validates the API payload and converts it to a TrustScore. Throws BAD_RESPONSE on anything malformed. */
export function normalizeTrustScore(raw: unknown): TrustScore {
  if (!isRecord(raw) || !isAddress(raw.address) || typeof raw.score !== 'number' || !Number.isFinite(raw.score)) {
    throw new CredentiaError('BAD_RESPONSE', 'The API returned an unexpected trust score response.');
  }
  const score = Math.min(100, Math.max(0, raw.score));
  const lastUpdated = typeof raw.lastUpdated === 'number' && raw.lastUpdated > 0 ? Math.floor(raw.lastUpdated) : undefined;
  const b = isRecord(raw.breakdown) ? raw.breakdown : undefined;
  return {
    address: raw.address,
    score,
    category: categorize(score, lastUpdated !== undefined || score > 0),
    breakdown: b ? { credentials: points(b.credentials), attestations: points(b.attestations), staking: points(b.staking) } : undefined,
    lastUpdated,
    source: 'live',
  };
}

export async function fetchTrustScore(http: HttpClient, address: string, signal?: AbortSignal): Promise<TrustScore> {
  const a = assertAddress(address);
  return normalizeTrustScore(await http.get(`/api/v1/trust-score/${a}`, signal));
}
