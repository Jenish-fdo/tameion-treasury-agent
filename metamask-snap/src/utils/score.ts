import type { TrustCategory } from '../types/trust';

/** 0-30 LOW, 31-60 LIMITED, 61-100 STRONGER. These describe how much evidence exists, not how safe a payment is. */
export function categorize(score: number, scored: boolean): TrustCategory {
  if (!scored) return 'UNKNOWN';
  const s = Math.round(score);
  return s <= 30 ? 'LOW' : s <= 60 ? 'LIMITED' : 'STRONGER';
}

export const CATEGORY_TITLE: Record<TrustCategory, string> = {
  LOW: 'LOW TRUST',
  LIMITED: 'LIMITED EVIDENCE',
  STRONGER: 'STRONGER EVIDENCE',
  UNKNOWN: 'NO TRUST DATA',
};

/** Fixed, qualified wording per category. Never says "trusted", "safe" or "verified payment". */
export const CATEGORY_MESSAGE: Record<TrustCategory, string[]> = {
  LOW: ['The recipient has limited available evidence.', 'Verify the recipient before signing.'],
  LIMITED: ['Some evidence is available, but manual verification is recommended.'],
  STRONGER: ['More supporting evidence is available.', 'Continue with normal payment caution.'],
  UNKNOWN: ['Credentia has no trust data for this recipient.', 'Verify the recipient before signing.'],
};

export const DISCLAIMER = 'This signal does not guarantee transaction safety.';
