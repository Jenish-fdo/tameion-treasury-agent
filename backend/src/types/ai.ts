/**
 * Types for the AI consensus system that decides whether a payment intent should proceed.
 */

/** A single model's decision. */
export type Verdict = 'GO' | 'STOP';

/**
 * The consensus decision. `REVIEW` means the models did not agree well enough to decide
 * automatically; callers must treat it as "do not proceed without a human".
 */
export type ConsensusVerdict = Verdict | 'REVIEW';

export type ModelName = 'kimi' | 'qwen' | 'jev';

/** The payment a caller wants evaluated. */
export interface PaymentIntent {
  /** Sender address. */
  from: string;
  /** Recipient address. */
  to: string;
  /** Amount in the token's smallest unit (wei), as a base-10 integer string. */
  amount: string;
  /** Token contract address or ticker symbol. */
  token: string;
  /** Free-text description of the payment. Untrusted. */
  context: string;
  /** Bypass the cache read and recompute (the fresh result still refreshes the cache). */
  fresh?: boolean;
}

/** Optional on-chain facts shown to the models. Not part of the cache key. */
export interface RiskSignals {
  /** 0-100, or null when unavailable. */
  senderTrustScore: number | null;
  recipientTrustScore: number | null;
}

export type ModelFailureReason =
  | 'not_configured'
  | 'timeout'
  | 'network_error'
  | 'rate_limited'
  | 'upstream_error'
  | 'invalid_response';

/** A model that answered with a usable verdict. */
export interface AIModelSuccess {
  model: ModelName;
  success: true;
  verdict: Verdict;
  /** 0-100. */
  confidence: number;
  reasoning: string;
  /** Total wall time across all attempts. */
  latencyMs: number;
  /** HTTP attempts made (1 = no retry needed). */
  attempts: number;
}

/** A model that produced no usable verdict. Counts as neutral in the consensus. */
export interface AIModelFailure {
  model: ModelName;
  success: false;
  error: ModelFailureReason;
  latencyMs: number;
  attempts: number;
}

export type AIModelResponse = AIModelSuccess | AIModelFailure;

export type ConsensusFlag = 'PROMPT_INJECTION_SUSPECTED';

export interface ConsensusResult {
  verdict: ConsensusVerdict;
  /** True only when `verdict` is GO. Clients should gate payments on this field alone. */
  isSafeToProceed: boolean;
  /** Short, human-readable next step for the user. */
  recommendedAction: string;
  /**
   * Weighted average (Kimi 50 / Qwen 30 / Jev 20, renormalised over the models that answered)
   * of the answering models' confidence, 0-100. It is NOT the confidence in `verdict` alone:
   * read it together with `agreement`.
   */
  confidence: number;
  /** 0-1: share of the answering models' weight on the side of `verdict` (heavier side for REVIEW). */
  agreement: number;
  votes: { GO: number; STOP: number };
  modelResults: AIModelResponse[];
  /** SHA-256 of the canonical intent; also the cache key. */
  intentHash: string;
  /** True when served from cache. */
  cached: boolean;
  flags: ConsensusFlag[];
  /** ISO timestamp of when the models were actually consulted. */
  evaluatedAt: string;
}

export interface ModelConfig {
  name: ModelName;
  /** Bearer token. Never logged. */
  apiKey?: string;
  /** Whether a missing apiKey means the model is unusable. */
  requiresApiKey: boolean;
  /** Base URL of an OpenAI-compatible API (`<endpoint>/chat/completions` is called). */
  endpoint: string;
  /** Provider model identifier. */
  model: string;
  /** Per-attempt timeout. */
  timeout: number;
  /** Share of the weighted confidence; weights are normalised if they do not sum to 1. */
  weight: number;
  /** Retries after the first attempt (2 => up to 3 attempts). */
  retries: number;
  /** Backoff before retry n is `retryBaseDelayMs * 2^n` (1s, 2s, ...). */
  retryBaseDelayMs: number;
}

export interface CacheEntry<T> {
  value: T;
  /** Epoch ms. */
  expiresAt: number;
}

export type LogEvent = 'model_call' | 'consensus' | 'error';

/** Shape of the structured audit-trail records. `timestamp` is added by the logger. */
export interface LogEntry {
  timestamp: string;
  event: LogEvent;
  intentHash?: string;
  model?: string;
  verdict?: string;
  confidence?: number;
  latencyMs?: number;
  attempts?: number;
  failure?: ModelFailureReason;
  cacheHit?: boolean;
  [key: string]: unknown;
}
