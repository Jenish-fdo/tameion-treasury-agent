import { CredentiaError } from './errors';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const MAX_EXPIRY = 4_102_444_800; // 2100-01-01, the registry's upper bound

export const isAddress = (v: unknown): v is string => typeof v === 'string' && ADDRESS.test(v);
export const isCredentialId = (v: unknown): v is string => typeof v === 'string' && BYTES32.test(v);

export function assertAddress(v: unknown, field = 'address'): string {
  if (!isAddress(v)) throw new CredentiaError('VALIDATION', `${field} must be a 0x-prefixed 20-byte address.`);
  return v;
}

export function assertCredentialId(v: unknown): string {
  if (!isCredentialId(v)) throw new CredentiaError('VALIDATION', 'credentialId must be a 0x-prefixed 32-byte hex string.');
  return v;
}

/** 0 = no expiry. Otherwise a unix-seconds timestamp in the future and before 2100. */
export function assertExpiry(v: unknown, nowSec: number = Math.floor(Date.now() / 1000)): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_EXPIRY) {
    throw new CredentiaError('VALIDATION', 'expiresAt must be 0 (no expiry) or a unix timestamp in seconds before 2100.');
  }
  if (v !== 0 && v <= nowSec) throw new CredentiaError('VALIDATION', 'expiresAt must be in the future.');
  return v;
}

export function assertMetadataUri(v: unknown): string | undefined {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string' || v.length > 2048 || !/^(https:\/\/|ipfs:\/\/)\S+$/.test(v)) {
    throw new CredentiaError('VALIDATION', 'metadataUri must be an https:// or ipfs:// URI.');
  }
  return v;
}

export function assertCredentialType(v: unknown): string {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 128) {
    throw new CredentiaError('VALIDATION', 'credentialType must be a non-empty string of at most 128 characters.');
  }
  return v.trim();
}

export function assertChainId(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new CredentiaError('VALIDATION', 'chainId must be a positive integer.');
  return v;
}
