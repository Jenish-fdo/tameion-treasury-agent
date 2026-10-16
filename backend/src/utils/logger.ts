import winston from 'winston';
import type { AIModelResponse, ConsensusResult, PaymentIntent } from '../types/ai.js';
import { hashIntent } from './intentHash.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    process.env.NODE_ENV === 'production' ? json() : combine(colorize(), consoleFormat)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

// ──────────────────────────────────────────────────────────────────────────────
// Structured audit trail for AI payment-intent evaluation (always JSON, one record per event).
// Context text is never logged (only its length); credentials are never logged.
// ──────────────────────────────────────────────────────────────────────────────

export const auditLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), errors({ stack: false }), json()),
  defaultMeta: { stream: 'ai-consensus-audit' },
  transports: [new winston.transports.Console()],
});

const SENSITIVE_KEY = /api[-_]?key|secret|authorization|password|private[-_]?key|bearer|cookie/i;
const SENSITIVE_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+|\bsk-[A-Za-z0-9_-]{8,}/g;

/** Deep-copies `value`, masking sensitive keys and credential-looking strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.replace(SENSITIVE_VALUE, '[REDACTED]');
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1)])
  );
}

const intentFields = (intent: PaymentIntent) => ({
  from: intent.from,
  to: intent.to,
  amount: intent.amount,
  token: intent.token,
  contextLength: intent.context.length,
});

/** Logs one model's outcome. `intentHash` is recomputed from `intent` unless supplied. */
export function logModelCall(
  model: string,
  intent: PaymentIntent,
  response: AIModelResponse,
  latencyMs: number,
  intentHash: string = hashIntent(intent)
): void {
  const base = { event: 'model_call', intentHash, model, latencyMs, attempts: response.attempts, ...intentFields(intent) };
  if (response.success) {
    auditLogger.info('model_call', { ...base, success: true, verdict: response.verdict, confidence: response.confidence });
  } else {
    auditLogger.warn('model_call', { ...base, success: false, failure: response.error });
  }
}

/** Logs the final consensus for an intent, including whether it came from cache. */
export function logConsensusResult(intent: PaymentIntent, result: ConsensusResult, cacheHit: boolean): void {
  const entry = {
    event: 'consensus',
    intentHash: result.intentHash,
    cacheHit,
    verdict: result.verdict,
    confidence: result.confidence,
    agreement: result.agreement,
    votes: result.votes,
    flags: result.flags,
    evaluatedAt: result.evaluatedAt,
    models: result.modelResults.map((m) =>
      m.success
        ? { model: m.model, verdict: m.verdict, confidence: m.confidence, latencyMs: m.latencyMs, attempts: m.attempts }
        : { model: m.model, failure: m.error, latencyMs: m.latencyMs, attempts: m.attempts }
    ),
    ...intentFields(intent),
  };
  // A REVIEW or flagged result deserves attention in the trail.
  if (result.verdict === 'REVIEW' || result.flags.length > 0) auditLogger.warn('consensus', entry);
  else auditLogger.info('consensus', entry);
}

/** Logs a failure with redacted metadata. */
export function logError(context: string, error: Error, metadata: Record<string, unknown> = {}): void {
  auditLogger.error('error', {
    event: 'error',
    context,
    errorName: error.name,
    errorMessage: redact(error.message),
    ...(redact(metadata) as Record<string, unknown>),
  });
}
