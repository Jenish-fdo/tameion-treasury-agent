import { createHash } from 'node:crypto';
import type { PaymentIntent } from '../types/ai.js';
import { sanitizeText } from './promptSanitizer.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Canonical form of an intent: case-insensitive addresses, sanitised context, `fresh` ignored. */
export function canonicalizeIntent(intent: PaymentIntent): string {
  return JSON.stringify({
    from: intent.from.toLowerCase(),
    to: intent.to.toLowerCase(),
    amount: intent.amount,
    token: ADDRESS.test(intent.token) ? intent.token.toLowerCase() : intent.token.toUpperCase(),
    context: sanitizeText(intent.context),
  });
}

/** SHA-256 (hex) of the canonical intent. Used as the cache key and the audit-log correlation id. */
export function hashIntent(intent: PaymentIntent): string {
  return createHash('sha256').update(canonicalizeIntent(intent)).digest('hex');
}
