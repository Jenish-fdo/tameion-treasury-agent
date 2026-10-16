import { z } from 'zod';
import { aiModels, CACHE_TTL_MS, MIN_MODELS } from '../config/aiModels.js';
import { AppError } from '../middleware/errorHandler.js';
import { paymentIntentSchema } from '../schemas/api.js';
import type {
  AIModelFailure, AIModelResponse, AIModelSuccess, ConsensusFlag, ConsensusResult, ConsensusVerdict, ModelConfig, ModelFailureReason, ModelName,
  PaymentIntent, RiskSignals, Verdict,
} from '../types/ai.js';
import { hashIntent } from '../utils/intentHash.js';
import { logConsensusResult, logError, logModelCall } from '../utils/logger.js';
import { modelCache } from '../utils/modelCache.js';
import { buildPaymentPrompt } from '../utils/promptBuilder.js';
import { detectPromptInjection, sanitizeText } from '../utils/promptSanitizer.js';

/** Thrown when fewer than MIN_MODELS models produced a usable verdict. Maps to HTTP 503. */
export class InsufficientModelsError extends AppError {
  constructor(public readonly modelResults: AIModelResponse[]) {
    super('Insufficient AI models available', 503, 'INSUFFICIENT_AI_MODELS', modelResults);
    this.name = 'InsufficientModelsError';
  }
}

/** The part of a cache the service needs (TTLCache satisfies it). */
export interface ConsensusCache {
  get(key: string): ConsensusResult | null;
  set(key: string, value: ConsensusResult, ttlMs: number): void;
}

/** The audit-log functions the service calls (utils/logger.ts satisfies it). */
export interface ConsensusAuditLog {
  logModelCall: typeof logModelCall;
  logConsensusResult: typeof logConsensusResult;
  logError: typeof logError;
}

export interface AIConsensusDeps {
  models?: Record<ModelName, ModelConfig>;
  cache?: ConsensusCache;
  cacheTtlMs?: number;
  log?: ConsensusAuditLog;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** What we require of a model's JSON reply (confidence is 0-100). */
const modelAnswerSchema = z.object({
  verdict: z.string().transform((v) => v.trim().toUpperCase()).pipe(z.enum(['GO', 'STOP'])),
  confidence: z.coerce.number().finite().transform((n) => Math.min(100, Math.max(0, n))),
  reasoning: z.string().transform((s) => s.slice(0, 500)).optional().default(''),
});

type Meta = 'model' | 'latencyMs' | 'attempts';
type Outcome = Omit<AIModelSuccess, Meta> | Omit<AIModelFailure, Meta>;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const RECOMMENDED_ACTION: Record<ConsensusVerdict, string> = {
  GO: 'No elevated risk detected. You may proceed, but verify the recipient.',
  STOP: 'Do not send this payment. Verify the recipient and the request through a trusted channel.',
  REVIEW: 'Do not send yet. Have a person review this payment before proceeding.',
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Extracts the first JSON object from a model reply (models sometimes add prose or code fences). */
function parseModelAnswer(content: string): z.infer<typeof modelAnswerSchema> | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = modelAnswerSchema.safeParse(JSON.parse(content.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Asks Kimi, Qwen and Jev whether a payment should proceed and combines their answers.
 *
 * Rules:
 *  - at least 2 models must answer, else {@link InsufficientModelsError};
 *  - 2+ GO => GO, 2+ STOP => STOP; two answers that disagree (the third failed) => REVIEW;
 *  - a GO is downgraded to REVIEW if the context looks like a prompt-injection attempt;
 *  - `confidence` is the weighted average of the answering models' confidences.
 *
 * Results are cached by intent hash for 5 minutes, and identical concurrent requests share one
 * set of model calls.
 */
export class AIConsensusService {
  private readonly models: Record<ModelName, ModelConfig>;
  private readonly cache: ConsensusCache;
  private readonly cacheTtlMs: number;
  private readonly log: ConsensusAuditLog;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly inflight = new Map<string, Promise<ConsensusResult>>();

  constructor(deps: AIConsensusDeps = {}) {
    this.models = deps.models ?? aiModels;
    this.cache = deps.cache ?? (modelCache as unknown as ConsensusCache);
    this.cacheTtlMs = deps.cacheTtlMs ?? CACHE_TTL_MS;
    this.log = deps.log ?? { logModelCall, logConsensusResult, logError };
    // Resolve globalThis.fetch per call so it can be swapped (e.g. in tests).
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Evaluates a payment intent.
   *
   * @param input   The payment to evaluate; validated with Zod (throws ZodError => HTTP 400).
   * @param signals Optional on-chain facts shown to the models (not part of the cache key).
   * @throws InsufficientModelsError when fewer than 2 models answered.
   */
  async evaluateIntent(input: PaymentIntent, signals?: RiskSignals): Promise<ConsensusResult> {
    const { fresh, ...parsed } = paymentIntentSchema.parse(input);
    const intent: PaymentIntent = { ...parsed, context: sanitizeText(parsed.context) };
    const intentHash = hashIntent(intent);

    if (!fresh) {
      const cached = this.getFromCache(intentHash);
      if (cached) {
        this.log.logConsensusResult(intent, cached, true);
        return cached;
      }
      const pending = this.inflight.get(intentHash);
      if (pending) return structuredClone(await pending);
    }

    const work = this.compute(intent, intentHash, signals);
    if (!fresh) {
      this.inflight.set(intentHash, work);
      // Always clear the slot, success or failure, without producing an unhandled rejection here.
      work.then(() => this.inflight.delete(intentHash), () => this.inflight.delete(intentHash));
    }
    return work;
  }

  private async compute(intent: PaymentIntent, intentHash: string, signals?: RiskSignals): Promise<ConsensusResult> {
    const suspicious = detectPromptInjection(intent.context);
    // The call* methods never reject: every failure becomes an AIModelFailure.
    const responses = await Promise.all([
      this.callKimi(intent, intentHash, signals),
      this.callQwen(intent, intentHash, signals),
      this.callJev(intent, intentHash, signals),
    ]);

    let result: ConsensusResult;
    try {
      result = this.calculateConsensus(responses, intentHash);
    } catch (err) {
      this.log.logError('ai-consensus', err as Error, { intentHash, models: responses.map((r) => ({ model: r.model, ok: r.success })) });
      throw err;
    }

    if (suspicious.length > 0) {
      const flags: ConsensusFlag[] = ['PROMPT_INJECTION_SUSPECTED'];
      result = { ...result, flags, verdict: result.verdict === 'GO' ? 'REVIEW' : result.verdict };
    }
    // Derived last, from the final verdict, so a downgrade is always reflected.
    result = { ...result, isSafeToProceed: result.verdict === 'GO', recommendedAction: RECOMMENDED_ACTION[result.verdict] };

    this.saveToCache(intentHash, result);
    this.log.logConsensusResult(intent, result, false);
    return structuredClone(result);
  }

  private callKimi(intent: PaymentIntent, intentHash: string, signals?: RiskSignals): Promise<AIModelResponse> {
    return this.callModel(this.models.kimi, intent, intentHash, signals);
  }

  private callQwen(intent: PaymentIntent, intentHash: string, signals?: RiskSignals): Promise<AIModelResponse> {
    return this.callModel(this.models.qwen, intent, intentHash, signals);
  }

  private callJev(intent: PaymentIntent, intentHash: string, signals?: RiskSignals): Promise<AIModelResponse> {
    return this.callModel(this.models.jev, intent, intentHash, signals);
  }

  /**
   * Calls one provider with a per-attempt timeout and exponential backoff. Retries network
   * errors, timeouts, 429 and 5xx; does not retry other 4xx or unparseable answers.
   * Never throws.
   */
  private async callModel(cfg: ModelConfig, intent: PaymentIntent, intentHash: string, signals?: RiskSignals): Promise<AIModelResponse> {
    const started = Date.now();
    let attempts = 0;
    const finish = (r: Outcome): AIModelResponse => {
      const latencyMs = Date.now() - started;
      const response = { model: cfg.name, latencyMs, attempts, ...r } as AIModelResponse;
      this.log.logModelCall(cfg.name, intent, response, latencyMs, intentHash);
      return response;
    };
    const fail = (error: ModelFailureReason) => finish({ success: false, error });

    if (!cfg.endpoint || !cfg.model || (cfg.requiresApiKey && !cfg.apiKey)) return fail('not_configured');

    const prompt = buildPaymentPrompt(intent, signals);
    const body = JSON.stringify({
      model: cfg.model,
      temperature: 0,
      max_tokens: 300,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;

    let lastError: ModelFailureReason = 'upstream_error';
    for (let attempt = 0; attempt <= cfg.retries; attempt++) {
      if (attempt > 0) await this.sleep(cfg.retryBaseDelayMs * 2 ** (attempt - 1));
      attempts++;
      try {
        const res = await this.fetchImpl(`${cfg.endpoint.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(cfg.timeout),
        });
        if (res.ok) {
          const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
          const content = json.choices?.[0]?.message?.content;
          const answer = typeof content === 'string' ? parseModelAnswer(content) : null;
          if (!answer) return fail('invalid_response');
          return finish({ success: true, verdict: answer.verdict as Verdict, confidence: answer.confidence, reasoning: answer.reasoning });
        }
        if (res.status === 429) lastError = 'rate_limited';
        else if (res.status >= 500) lastError = 'upstream_error';
        else return fail('upstream_error'); // other 4xx: bad key/request, retrying cannot help
      } catch (err) {
        const name = (err as Error | undefined)?.name;
        lastError = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network_error';
      }
    }
    return fail(lastError);
  }

  /**
   * Combines model answers into a consensus.
   *
   * @throws InsufficientModelsError when fewer than 2 models answered.
   */
  private calculateConsensus(responses: AIModelResponse[], intentHash = ''): ConsensusResult {
    const answered = responses.filter((r): r is AIModelSuccess => r.success);
    if (answered.length < MIN_MODELS) throw new InsufficientModelsError(responses);

    const go = answered.filter((r) => r.verdict === 'GO');
    const stop = answered.filter((r) => r.verdict === 'STOP');
    const verdict = go.length >= 2 ? 'GO' : stop.length >= 2 ? 'STOP' : 'REVIEW';

    // Weights are renormalised over the models that answered, so a failed model does not drag the average down.
    const weightOf = (r: AIModelSuccess): number => this.models[r.model].weight;
    const total = answered.reduce((sum, r) => sum + weightOf(r), 0);
    const confidence = answered.reduce((sum, r) => sum + weightOf(r) * r.confidence, 0) / total;
    const share = (group: AIModelSuccess[]): number => group.reduce((sum, r) => sum + weightOf(r), 0) / total;
    const agreement = verdict === 'GO' ? share(go) : verdict === 'STOP' ? share(stop) : Math.max(share(go), share(stop));

    return {
      verdict,
      isSafeToProceed: verdict === 'GO',
      recommendedAction: RECOMMENDED_ACTION[verdict],
      confidence: round2(confidence),
      agreement: round2(agreement),
      votes: { GO: go.length, STOP: stop.length },
      modelResults: responses,
      intentHash,
      cached: false,
      flags: [],
      evaluatedAt: this.now().toISOString(),
    };
  }

  private getFromCache(intentHash: string): ConsensusResult | null {
    const hit = this.cache.get(intentHash);
    return hit ? { ...structuredClone(hit), cached: true } : null;
  }

  private saveToCache(intentHash: string, result: ConsensusResult): void {
    this.cache.set(intentHash, structuredClone(result), this.cacheTtlMs);
  }
}

/** Process-wide instance wired to the real config, cache and logger. */
export const aiConsensusService = new AIConsensusService();
