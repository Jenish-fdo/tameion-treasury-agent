import type { Credential, CredentialStatus } from '../types';
import { CredentiaError, isCredentiaError } from '../utils/errors';
import { assertAddress, assertCredentialId, isAddress, isCredentialId } from '../utils/validation';
import type { HttpClient } from './client';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sec = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined);

/** Revoked beats expired beats active. expiresAt 0/undefined means no expiry. */
export function statusOf(isRevoked: boolean, expiresAt: number | undefined, nowSec: number = Math.floor(Date.now() / 1000)): CredentialStatus {
  if (isRevoked) return 'REVOKED';
  if (expiresAt !== undefined && expiresAt <= nowSec) return 'EXPIRED';
  return 'ACTIVE';
}

export function normalizeCredential(raw: unknown, nowSec?: number): Credential {
  if (!isRecord(raw) || !isCredentialId(raw.credentialId) || !isAddress(raw.issuer) || !isAddress(raw.subject)) {
    throw new CredentiaError('BAD_RESPONSE', 'The API returned an unexpected credential response.');
  }
  const expiresAt = sec(raw.expiresAt);
  const uri = typeof raw.metadataUri === 'string' && raw.metadataUri.length <= 2048 ? raw.metadataUri : undefined;
  return {
    id: raw.credentialId,
    subject: raw.subject,
    issuer: raw.issuer,
    type: typeof raw.credentialType === 'string' && raw.credentialType ? raw.credentialType.slice(0, 128) : 'unknown',
    status: statusOf(raw.isRevoked === true, expiresAt, nowSec),
    issuedAt: sec(raw.issuedAt),
    expiresAt,
    metadataUri: uri,
  };
}

/** A credential that does not exist is a normal answer (status NOT_FOUND), not an error. */
export async function fetchCredential(http: HttpClient, credentialId: string, signal?: AbortSignal): Promise<Credential> {
  const id = assertCredentialId(credentialId);
  try {
    return normalizeCredential(await http.get(`/api/v1/credential/${id}/verify`, signal));
  } catch (e) {
    if (isCredentiaError(e) && e.code === 'NOT_FOUND') return { id, subject: '', issuer: '', type: 'unknown', status: 'NOT_FOUND' };
    throw e;
  }
}

export async function fetchAgentCredentials(http: HttpClient, address: string, signal?: AbortSignal): Promise<Credential[]> {
  const a = assertAddress(address);
  const raw = await http.get(`/api/v1/agent/${a}/credentials`, signal);
  if (!isRecord(raw) || !Array.isArray(raw.credentials)) throw new CredentiaError('BAD_RESPONSE', 'The API returned an unexpected credentials response.');
  return raw.credentials.slice(0, 200).map((c) => normalizeCredential(c));
}
