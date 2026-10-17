/**
 * Shared types and helpers for the Phase 3 screens: mandates, the decision log and the agent's pre-payment check.
 * ARC TESTNET ONLY. Amounts are USDC in 6-decimal base units (the ERC-20 interface), carried as decimal strings.
 * Category ids and enum names mirror contracts/src/libraries/MandateCategories.sol and the backend (src/chain/treasury.ts).
 */

export const CATEGORIES = [
  { id: 'PAYROLL', label: 'Payroll' },
  { id: 'VENDOR_INVOICE', label: 'Vendor invoice' },
  { id: 'TAX', label: 'Tax' },
  { id: 'SUBSCRIPTION', label: 'Subscription' },
  { id: 'UTILITIES', label: 'Utilities' },
  { id: 'RENT', label: 'Rent' },
  { id: 'CONTRACTOR', label: 'Contractor' },
  { id: 'REFUND', label: 'Refund' },
  { id: 'OTHER', label: 'Other' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const categoryLabel = (id: string): string => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const RISK_TIERS = [
  { n: 0, label: 'Low' },
  { n: 1, label: 'Medium' },
  { n: 2, label: 'High' },
  { n: 3, label: 'Critical' },
] as const;
export const riskLabel = (n: number): string => RISK_TIERS.find((t) => t.n === n)?.label ?? String(n);

/** Plain-language meaning of each reason the contract can give for refusing a payment. */
export const REASON_TEXT: Record<string, string> = {
  NONE: 'Allowed.',
  UNKNOWN_MANDATE: 'No such mandate on the registry.',
  REVOKED: 'The business owner revoked this mandate.',
  CONSUMED: 'This was a single-use mandate and it has already been used.',
  EXPIRED: 'The mandate has expired.',
  WRONG_AGENT: 'This agent address is not the one the mandate was granted to.',
  ZERO_AMOUNT: 'The amount is zero.',
  CATEGORY_NOT_ALLOWED: 'The mandate does not allow this payment category.',
  RECIPIENT_NOT_ALLOWED: 'The recipient is not on the mandate’s allowlist.',
  RISK_TIER_TOO_HIGH: 'The payment’s risk tier is higher than this mandate allows.',
  OVER_PER_TX_LIMIT: 'The amount is over the per-transaction limit.',
  OVER_DAILY_CAP: 'The amount would take today’s spending over the daily cap.',
  OVER_WEEKLY_CAP: 'The amount would take this week’s spending over the weekly cap.',
  OVER_MONTHLY_CAP: 'The amount would take this month’s spending over the monthly cap.',
  PAYMENT_ALREADY_USED: 'This payment id was already used on this mandate.',
};

export class InvalidUsdcError extends Error {}

/** "12.5" -> "12500000". At most 6 decimals, no signs, no exponents; throws InvalidUsdcError otherwise. */
export function usdcToBaseUnits(input: string, opts: { allowZero?: boolean } = {}): string {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d{1,24})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) throw new InvalidUsdcError('Enter an amount like 250 or 250.50 (at most 6 decimals).');
  const base = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0') || '0');
  if (base === 0n && !opts.allowZero) throw new InvalidUsdcError('Enter an amount above zero.');
  return base.toString();
}

/** "12500000" -> "12.50". Keeps at least two decimals, trims the rest, groups thousands. */
export function baseUnitsToUsdc(base: string): string {
  if (!/^\d+$/.test(base)) return base;
  const v = BigInt(base);
  const whole = (v / 1_000_000n).toLocaleString('en-US');
  const frac = (v % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${frac}`;
}

// ---- API shapes (the backend's JSON) ----------------------------------------------------------------------------------

export interface MandateView {
  mandateId: string;
  businessId: string;
  owner: string;
  agent: string;
  agentId: string;
  status: 'NONE' | 'ACTIVE' | 'REVOKED' | 'CONSUMED' | 'EXPIRED';
  effectiveStatus: 'NONE' | 'ACTIVE' | 'REVOKED' | 'CONSUMED' | 'EXPIRED';
  categories: string[];
  perTxLimit: string;
  dailyCap: string;
  weeklyCap: string;
  monthlyCap: string;
  approvalThreshold: string;
  maxRiskTier: number;
  singleUse: boolean;
  expiresAt: number;
  createdAt: number;
  nonce: string;
  spend: { day: string; week: string; month: string };
  recipients: string[] | null;
}

export interface DecisionView {
  decisionId: string;
  seq: number;
  timestamp: number;
  recorder: string;
  businessId: string;
  agentId: string;
  mandateId: string | null;
  action: string;
  counterparty: string | null;
  amount: string;
  riskTier: number;
  riskScore: number;
  outcome: string;
  rationaleHash: string;
  txHash: string | null;
  approvalRef: string | null;
  parentDecisionId: string | null;
  recordHash: string;
  hashVerified: boolean;
}

export interface Page<T> {
  total: number | null;
  offset: number;
  limit: number;
  items: T[];
  linked?: boolean | null;
}

export interface ValidateResult {
  mandateId: string;
  allowed: boolean;
  needsApproval: boolean;
  reason: string;
  remaining: { daily: string; weekly: string; monthly: string };
  checkedAt: number;
}

// ---- client for the same-origin proxy ---------------------------------------------------------------------------------

export interface PayResult {
  status: 'executed' | 'rejected' | 'escalated' | 'pending';
  reason?: string;
  paymentId: string;
  amount?: string;
  recipient?: string;
  transferTxHash?: string;
  consumeTxHash?: string;
  explorerUrl?: string;
  decisionId?: string;
  note?: string;
}

export class TreasuryApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly details?: { field: string; message: string }[]) {
    super(message);
  }
}

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/** Calls the backend through /api/backend/... (the API key stays on the server). Throws TreasuryApiError. */
export async function treasuryFetch<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/backend/${path.replace(/^\/+/, '')}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: 'no-store',
    });
  } catch {
    throw new TreasuryApiError(NETWORK_MESSAGE, 0, 'NETWORK');
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new TreasuryApiError('The server sent a reply this page could not read.', res.status, 'BAD_RESPONSE');
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
    const details = Array.isArray(e?.details)
      ? (e!.details as unknown[]).filter((d): d is { field: string; message: string } => typeof (d as { field?: unknown })?.field === 'string' && typeof (d as { message?: unknown })?.message === 'string')
      : undefined;
    throw new TreasuryApiError(typeof e?.message === 'string' ? e.message : 'The request failed.', res.status, typeof e?.code === 'string' ? e.code : 'ERROR', details);
  }
  return json as T;
}

export const errorText = (e: unknown): string => {
  if (e instanceof TreasuryApiError) {
    const first = e.details?.[0];
    return first ? `${e.message}: ${first.field} ${first.message}` : e.message;
  }
  return 'Something went wrong. Nothing was changed.';
};
