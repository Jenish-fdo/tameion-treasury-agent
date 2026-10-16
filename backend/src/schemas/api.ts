import { getAddress, isAddress } from 'viem';
import { z } from 'zod';

export const MAX_EXPIRY = 4102444800; // matches CredentialRegistry.MAX_EXPIRY (year 2100)

export const addressSchema = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), 'must be a valid EVM address (0x + 40 hex chars)')
  .transform((v) => getAddress(v.toLowerCase()));

export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex string')
  .transform((v) => v.toLowerCase() as `0x${string}`);

const ALLOWED_URI_SCHEMES = new Set(['https:', 'ipfs:', 'ar:']);

export const metadataUriSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((v) => {
    try {
      return ALLOWED_URI_SCHEMES.has(new URL(v).protocol);
    } catch {
      return false;
    }
  }, 'must be an https://, ipfs:// or ar:// URI');

export const mintBodySchema = z
  .object({
    issuer: addressSchema,
    subject: addressSchema,
    credentialType: z.string().trim().min(1).max(128),
    metadataUri: metadataUriSchema,
    // Unix seconds. 0 = never expires.
    expiresAt: z.number().int().nonnegative().max(MAX_EXPIRY),
  })
  .strict(); // rejects unknown keys (e.g. someone posting a privateKey field)

export const credentialIdParamSchema = z.object({ credentialId: bytes32Schema });
export const addressParamSchema = z.object({ address: addressSchema });

// Amount in the token's smallest unit (wei): a positive base-10 integer that fits in a uint256.
const weiAmount = z
  .string()
  .regex(/^\d{1,78}$/, 'must be a base-10 integer string in the token\'s smallest unit (wei)')
  .refine((v) => /[1-9]/.test(v), 'must be greater than zero');

export const paymentIntentSchema = z
  .object({
    from: addressSchema,
    to: addressSchema,
    amount: weiAmount,
    // Token contract address or ticker symbol
    token: z.union([addressSchema, z.string().regex(/^[A-Za-z0-9._-]{1,32}$/, 'must be a token address or symbol')]),
    context: z.string().max(2000),
    // Skip the result cache and re-ask the models.
    fresh: z.boolean().optional(),
  })
  .strict();

export type MintBody = z.infer<typeof mintBodySchema>;
export type IntentBody = z.infer<typeof paymentIntentSchema>;
