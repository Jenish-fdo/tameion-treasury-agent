import { encodePacked, isAddress, keccak256, toBytes, type Address, type Hex } from 'viem';
import { z } from 'zod';

/**
 * A Credentia credential has two halves:
 *  - the human-readable record (title, recipient name, description, salt), which travels in the share link, and
 *  - the on-chain anchor in CredentialRegistry: issuer, holder, type hash, data hash, issue time, expiry, revoked flag.
 * The on-chain `dataHash` commits to the record, so a verifier can recompute it and detect any edit to the link.
 */

export const TITLE_MAX = 80;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 280;

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';
/** Stand-in issuer for demo credentials that are never sent to a chain. */
export const DEMO_ISSUER: Address = '0x000000000000000000000000000000000000dEaD';

export interface CredentialRecord {
  title: string;
  recipientName: string;
  description: string;
  /** Random per credential, so issuing the same words twice gives two distinct credentials. */
  salt: Hex;
}

/** What a share link carries. Everything except `tx` is committed to by the on-chain hash and ID. */
export interface SharePayload extends CredentialRecord {
  v: 1;
  issuer: Address;
  holder: Address;
  /** Unix seconds; 0 means no expiry. */
  expiry: number;
  /** Unix seconds when issued (informational for demo; the chain's own timestamp wins when anchored). */
  issuedAt: number;
  /** Anchoring transaction, when there is one. Not part of the commitment (it does not exist before the transaction). */
  tx?: Hex;
  /** True when the credential was never sent to a chain. Such a credential can never show as verified. */
  demo?: boolean;
}

export const formSchema = z.object({
  title: z.string().trim().min(1, 'Enter a credential title.').max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
  recipientName: z.string().trim().min(1, 'Enter the recipient’s name.').max(NAME_MAX, `Keep the name under ${NAME_MAX} characters.`),
  holder: z.string().trim().refine((v) => isAddress(v, { strict: false }), 'Enter a full 0x… wallet address (42 characters).'),
  description: z.string().trim().max(DESCRIPTION_MAX, `Keep the description under ${DESCRIPTION_MAX} characters.`).default(''),
  /** yyyy-mm-dd or empty */
  expiryDate: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date.')
    .refine((v) => v === '' || expiryToUnix(v) > Math.floor(Date.now() / 1000), 'Choose an expiry date in the future.'),
});
export type FormValues = z.input<typeof formSchema>;

/** End of the chosen day, UTC, so "expires on the 5th" includes the 5th. */
export function expiryToUnix(date: string): number {
  if (!date) return 0;
  const ms = Date.parse(`${date}T23:59:59Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Canonical commitment input. Order and encoding are fixed: changing them invalidates every issued credential. */
export function canonicalRecord(r: CredentialRecord): string {
  return JSON.stringify([1, r.title, r.recipientName, r.description, r.salt.toLowerCase()]);
}

export function hashRecord(r: CredentialRecord): Hex {
  return keccak256(toBytes(canonicalRecord(r)));
}

export function typeHash(title: string): Hex {
  return keccak256(toBytes(title));
}

/** Mirrors CredentialRegistry._computeCredentialId: keccak256(abi.encodePacked(issuer, holder, credentialType, dataHash)). */
export function computeCredentialId(issuer: Address, holder: Address, title: string, dataHash: Hex): Hex {
  return keccak256(encodePacked(['address', 'address', 'bytes32', 'bytes32'], [issuer, holder, typeHash(title), dataHash]));
}

export function idForPayload(p: SharePayload): Hex {
  return computeCredentialId(p.issuer, p.holder, p.title, hashRecord(p));
}

// --- share-link encoding ---------------------------------------------------------------------------------------

const payloadSchema = z.object({
  v: z.literal(1),
  title: z.string().min(1).max(TITLE_MAX),
  recipientName: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX),
  salt: z.string().regex(/^0x[0-9a-fA-F]{32}$/),
  issuer: z.string().refine((v) => isAddress(v, { strict: false })),
  holder: z.string().refine((v) => isAddress(v, { strict: false })),
  expiry: z.number().int().min(0),
  issuedAt: z.number().int().min(0),
  tx: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  demo: z.boolean().optional(),
});

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodePayload(p: SharePayload): string {
  return toBase64Url(JSON.stringify(p));
}

/** Returns null for anything that is not a well-formed payload. The payload is untrusted input. */
export function decodePayload(raw: string | null | undefined): SharePayload | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(fromBase64Url(raw)));
    return parsed.success ? (parsed.data as SharePayload) : null;
  } catch {
    return null;
  }
}

export const isCredentialId = (v: string): v is Hex => /^0x[0-9a-fA-F]{64}$/.test(v);

export function verifyPath(id: string, payload?: SharePayload): string {
  return payload ? `/verify/${id}?d=${encodePayload(payload)}` : `/verify/${id}`;
}
export function receiptPath(id: string, payload?: SharePayload): string {
  return payload ? `/receipt/${id}?d=${encodePayload(payload)}` : `/receipt/${id}`;
}

// --- status ----------------------------------------------------------------------------------------------------

export type CredentialStatus = 'VERIFIED' | 'PENDING' | 'REVOKED' | 'EXPIRED' | 'NOT_FOUND' | 'MISMATCH' | 'DEMO' | 'UNAVAILABLE';

export interface OnChainCredential {
  issuer: Address;
  holder: Address;
  credentialType: Hex;
  dataHash: Hex;
  issuedAt: number;
  expiryTimestamp: number;
  revoked: boolean;
}

export interface Assessment {
  status: CredentialStatus;
  /** Plain-language reason, shown next to the status. */
  detail: string;
}

/**
 * Decide what to tell a verifier. Order matters: a demo credential is never "verified", and details that do not
 * match the on-chain commitment are flagged before anything else is claimed.
 * `chain` is null when the registry has no such credential; `undefined` means the lookup could not be made.
 */
export function assess(payload: SharePayload | null, id: string, chain: OnChainCredential | null | undefined, nowSec: number): Assessment {
  if (payload?.demo) {
    return { status: 'DEMO', detail: 'Demo credential. It was never anchored on Arc, so it cannot be verified.' };
  }
  if (chain === undefined) {
    return { status: 'UNAVAILABLE', detail: 'The Arc registry could not be reached or is not configured, so this credential could not be checked.' };
  }
  if (chain === null) {
    return { status: 'NOT_FOUND', detail: 'No credential with this ID exists in the registry.' };
  }
  if (payload) {
    const matches =
      idForPayload(payload).toLowerCase() === id.toLowerCase() &&
      chain.dataHash.toLowerCase() === hashRecord(payload).toLowerCase() &&
      chain.holder.toLowerCase() === payload.holder.toLowerCase() &&
      chain.issuer.toLowerCase() === payload.issuer.toLowerCase();
    if (!matches) {
      return { status: 'MISMATCH', detail: 'The details in this link do not match what was recorded on Arc. Do not rely on them.' };
    }
  }
  if (chain.revoked) return { status: 'REVOKED', detail: 'The issuer has revoked this credential.' };
  if (chain.expiryTimestamp !== 0 && chain.expiryTimestamp <= nowSec) return { status: 'EXPIRED', detail: 'This credential has passed its expiry date.' };
  return {
    status: 'VERIFIED',
    detail: payload
      ? 'The details match the record anchored on Arc and the credential is active.'
      : 'This credential is anchored on Arc and active. The link carries no personal details to compare.',
  };
}

export const STATUS_LABEL: Record<CredentialStatus, string> = {
  VERIFIED: 'VERIFIED',
  PENDING: 'PENDING',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  NOT_FOUND: 'NOT FOUND',
  MISMATCH: 'DETAILS DO NOT MATCH',
  DEMO: 'DEMO · NOT ANCHORED',
  UNAVAILABLE: 'CANNOT CHECK',
};
