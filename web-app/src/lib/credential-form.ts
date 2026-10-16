import { keccak256, toBytes } from 'viem';
import { z } from 'zod';
import { ADDRESS_PATTERN } from '@/lib/api';

export const CREDENTIAL_TYPES = ['Identity Verification', 'KYC Passed', 'Trusted Merchant', 'AI Agent Verified', 'Custom'] as const;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD (the format of <input type="date">). */
export const toDateInput = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: Date, days: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

export const credentialFormSchema = z
  .object({
    subject: z.string().trim().regex(ADDRESS_PATTERN, 'Enter a valid 0x… address (42 characters).'),
    credentialType: z.enum(CREDENTIAL_TYPES, { errorMap: () => ({ message: 'Choose a credential type.' }) }),
    customType: z.string().trim().max(64, 'Keep the custom type under 64 characters.').optional(),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an expiration date.'),
    metadataUri: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => v === '' || /^(ipfs:\/\/\S+|https:\/\/\S+)$/.test(v), 'Use an ipfs:// or https:// link, or leave this empty.'),
    notes: z.string().max(500, 'Keep notes under 500 characters.').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.credentialType === 'Custom' && !v.customType) {
      ctx.addIssue({ code: 'custom', path: ['customType'], message: 'Name the custom credential type.' });
    }
  });
export type CredentialFormValues = z.infer<typeof credentialFormSchema>;

/** Returns an error message when `expiresOn` is outside [today, today + 1 year], else null. */
export function expiryError(expiresOn: string, today: Date = new Date()): string | null {
  const min = toDateInput(today);
  const max = toDateInput(addDays(today, 365));
  if (expiresOn < min) return 'The expiration date cannot be in the past.';
  if (expiresOn > max) return 'The expiration date can be at most one year from today.';
  return null;
}

export interface PreparedCredential {
  issuer: string;
  subject: string;
  credentialType: string;
  credentialTypeHash: string;
  /** Unix seconds: the end of the chosen day, UTC. */
  expiryTimestamp: number;
  metadataUri: string | null;
  dataHash: string | null;
}

/** Builds the (unsigned) request details. Notes are deliberately not part of it. */
export function prepareCredential(v: CredentialFormValues, issuer: string): PreparedCredential {
  const type = v.credentialType === 'Custom' ? (v.customType ?? '').trim() : v.credentialType;
  const [y, m, d] = v.expiresOn.split('-').map(Number);
  return {
    issuer,
    subject: v.subject.trim(),
    credentialType: type,
    credentialTypeHash: keccak256(toBytes(type)),
    expiryTimestamp: Math.floor(Date.UTC(y, m - 1, d, 23, 59, 59) / 1000),
    metadataUri: v.metadataUri ? v.metadataUri : null,
    dataHash: v.metadataUri ? keccak256(toBytes(v.metadataUri)) : null,
  };
}
