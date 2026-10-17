/**
 * Client for the Credentia backend, used by the browser.
 *
 * Browser code never talks to the backend directly: it calls the same-origin Next.js route
 * `/api/payment-check`, which attaches the (server-only) API key. That keeps the key out of the
 * JavaScript bundle.
 */
import { parseUnits } from 'viem';

// ── Types ───────────────────────────────────────────────────────────────────────────────────

export type ConsensusVerdict = 'GO' | 'STOP' | 'REVIEW';
export type ModelVerdict = 'GO' | 'STOP' | 'NEUTRAL';
export type ModelName = 'kimi' | 'qwen' | 'jev';

/** Body sent to `POST /api/v1/intent/evaluate`. `amount` is a wei integer string. */
export interface PaymentCheckRequest {
  from: string;
  to: string;
  amount: string;
  token: string;
  context: string;
}

export interface ModelResult {
  model: ModelName;
  /** NEUTRAL = the model gave no usable answer (timeout, error, not configured). */
  verdict: ModelVerdict;
  /** 0-100. */
  confidence: number;
  reasoning: string;
  latencyMs: number;
}

export interface PaymentCheckResult {
  verdict: ConsensusVerdict;
  /** 0-100. */
  confidence: number;
  /** 0-1. */
  agreement: number;
  /** The only field that may grant permission to proceed. */
  isSafeToProceed: boolean;
  recommendedAction: string;
  modelResults: ModelResult[];
  flags: string[];
  cached: boolean;
}

export type PaymentCheckErrorKind = 'validation' | 'auth' | 'rate_limit' | 'insufficient_models' | 'service' | 'network' | 'not_found';

export class PaymentCheckError extends Error {
  constructor(public readonly kind: PaymentCheckErrorKind, public readonly status?: number) {
    super(kind); // deliberately no server text: it must never reach the UI
    this.name = 'PaymentCheckError';
  }
}

// ── Amount handling (no floating point anywhere) ────────────────────────────────────────────

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export const TOKEN_DECIMALS = 18;
const MAX_WEI_DIGITS = 78; // fits a uint256; also the backend limit

/**
 * Converts a human-readable amount ("12.50") into the token's smallest unit as a base-10
 * integer string ("12500000000000000000"), using exact string/BigInt arithmetic.
 *
 * @throws InvalidAmountError for empty, malformed, zero, negative, over-precise or oversized input.
 */
export function parseAmountToWei(input: string, decimals: number = TOKEN_DECIMALS): string {
  const value = input.trim();
  if (value === '') throw new InvalidAmountError('Enter an amount.');
  if (!/^\d+(\.\d+)?$/.test(value)) throw new InvalidAmountError('Enter a positive number, for example 12.50.');
  const fraction = value.split('.')[1] ?? '';
  if (fraction.length > decimals) throw new InvalidAmountError(`Use at most ${decimals} decimal places.`);
  const wei = parseUnits(value, decimals);
  if (wei <= 0n) throw new InvalidAmountError('Amount must be greater than zero.');
  const text = wei.toString();
  if (text.length > MAX_WEI_DIGITS) throw new InvalidAmountError('Amount is too large.');
  return text;
}

// ── Response normalisation (fail closed) ────────────────────────────────────────────────────

const MODELS: ModelName[] = ['kimi', 'qwen', 'jev'];
const FAILURE_COPY: Record<string, string> = {
  not_configured: 'This model is not configured on the server.',
  timeout: 'This model did not respond in time.',
  network_error: 'This model could not be reached.',
  rate_limited: 'This model is rate limited right now.',
  upstream_error: 'This model returned an error.',
  invalid_response: 'This model returned an unusable answer.',
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

function normalizeModel(model: ModelName, raw: unknown): ModelResult {
  const neutral = (reasoning: string, latencyMs = 0): ModelResult => ({ model, verdict: 'NEUTRAL', confidence: 0, reasoning, latencyMs });
  if (!isRecord(raw)) return neutral('No response from this model.');
  const latencyMs = Math.round(num(raw.latencyMs, 0, 10 * 60 * 1000));
  if (raw.success === true && (raw.verdict === 'GO' || raw.verdict === 'STOP')) {
    return { model, verdict: raw.verdict, confidence: num(raw.confidence, 0, 100), reasoning: text(raw.reasoning, 500), latencyMs };
  }
  return neutral(FAILURE_COPY[text(raw.error, 40)] ?? 'This model gave no usable answer.', latencyMs);
}

/**
 * Validates and reshapes the backend payload.
 *
 * Fail-closed: `isSafeToProceed` is true only if the server sent literally `true` AND the verdict
 * is GO. The verdict can only ever remove permission here, never grant it.
 *
 * @throws PaymentCheckError('service') when the payload is not a recognisable result.
 */
export function normalizeResult(raw: unknown): PaymentCheckResult {
  if (!isRecord(raw) || (raw.verdict !== 'GO' && raw.verdict !== 'STOP' && raw.verdict !== 'REVIEW')) {
    throw new PaymentCheckError('service');
  }
  const verdict = raw.verdict;
  const rawModels = Array.isArray(raw.modelResults) ? raw.modelResults : [];
  return {
    verdict,
    confidence: num(raw.confidence, 0, 100),
    agreement: num(raw.agreement, 0, 1),
    isSafeToProceed: raw.isSafeToProceed === true && verdict === 'GO',
    recommendedAction: text(raw.recommendedAction, 300) || 'Do not send this payment until it has been reviewed.',
    modelResults: MODELS.map((m) => normalizeModel(m, rawModels.find((r) => isRecord(r) && r.model === m))),
    flags: Array.isArray(raw.flags) ? raw.flags.filter((f): f is string => typeof f === 'string').slice(0, 10) : [],
    cached: raw.cached === true,
  };
}

// ── Request ─────────────────────────────────────────────────────────────────────────────────

/** Same-origin proxy route (see src/app/api/payment-check/route.ts). */
export const PAYMENT_CHECK_ENDPOINT = '/api/payment-check';
const REQUEST_TIMEOUT_MS = 60_000; // the backend allows ~33 s worst case for slow providers

export interface CheckPaymentOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const readCode = async (res: Response): Promise<string> => {
  try {
    const body: unknown = await res.json();
    return isRecord(body) && isRecord(body.error) ? text(body.error.code, 64) : '';
  } catch {
    return '';
  }
};

/**
 * Asks the backend whether a payment looks safe.
 *
 * @throws PaymentCheckError with a `kind` the UI maps to friendly copy. No server text, headers
 *         or bodies are ever attached to the error.
 */
export async function checkPayment(request: PaymentCheckRequest, options: CheckPaymentOptions = {}): Promise<PaymentCheckResult> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  // Combine the caller's cancel signal with our own timeout (AbortSignal.any/timeout are not in older Safari).
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, REQUEST_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetchImpl(PAYMENT_CHECK_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err) {
      if (options.signal?.aborted) throw err; // caller cancelled: let the hook ignore it
      throw new PaymentCheckError('network');
    }

    if (res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new PaymentCheckError('service', res.status);
      }
      return normalizeResult(body);
    }

    const code = await readCode(res);
    if (res.status === 400) throw new PaymentCheckError('validation', 400);
    if (res.status === 401 || res.status === 403) throw new PaymentCheckError('auth', res.status);
    if (res.status === 429) throw new PaymentCheckError('rate_limit', 429);
    if (res.status === 503 && code === 'INSUFFICIENT_AI_MODELS') throw new PaymentCheckError('insufficient_models', 503);
    throw new PaymentCheckError('service', res.status);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

/** Copy shown to users for each failure kind. */
export const ERROR_COPY: Record<PaymentCheckErrorKind, { title: string; message: string }> = {
  validation: {
    title: 'Check the payment details',
    message: 'Some details were rejected. Check the recipient address, amount and description, then try again.',
  },
  auth: {
    title: 'Risk check is not authorised',
    message: 'The demo server is missing a valid API key. Ask the demo operator to check the server configuration.',
  },
  rate_limit: {
    title: 'Too many checks',
    message: 'Risk checks are rate limited. Please wait a little while and try again.',
  },
  insufficient_models: {
    title: 'Not enough AI models available',
    message: 'Fewer than two risk models responded, so no verdict was issued. Treat this payment as not approved and try again shortly.',
  },
  service: {
    title: 'Risk check unavailable',
    message: 'The risk-check service had a problem. Treat this payment as not approved and try again shortly.',
  },
  network: {
    title: "Couldn't reach the service",
    message: 'Check your connection and try again.',
  },
  not_found: {
    title: 'Not found',
    message: 'No matching record exists.',
  },
};
