/**
 * Fake Kimi / Qwen / Jev providers for tests. `createMockFetch` returns a drop-in `fetch` that
 * routes by endpoint URL and replays scripted behaviours; no network is involved.
 */
import type { ModelConfig, ModelName, PaymentIntent, Verdict } from '../../src/types/ai.js';

export const MOCK_ENDPOINTS: Record<ModelName, string> = {
  kimi: 'https://kimi.mock/v1',
  qwen: 'https://qwen.mock/v1',
  jev: 'https://jev.mock/v1',
};

export type MockBehavior =
  /** 200 with a well-formed verdict. */
  | { type: 'success'; verdict: Verdict; confidence?: number; reasoning?: string }
  /** 200 whose message content is exactly `content` (for fenced / malformed output). */
  | { type: 'raw'; content: string }
  /** Non-200 status. */
  | { type: 'http_error'; status: number }
  /** Connection failure (fetch rejects). */
  | { type: 'network_error' }
  /** Never answers; rejects only when the caller's AbortSignal fires. */
  | { type: 'timeout' }
  /** Waits `delayMs` (honouring abort), then behaves as `then`. */
  | { type: 'slow'; delayMs: number; then: MockBehavior }
  /** One behaviour per call, in order; the last one repeats. */
  | { type: 'sequence'; steps: MockBehavior[] };

export interface RecordedCall {
  model: ModelName;
  url: string;
  headers: Record<string, string>;
  body: { model: string; temperature: number; max_tokens: number; messages: { role: string; content: string }[] };
}

type FetchArgs = Parameters<typeof fetch>;

export interface MockFetch {
  (input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response>;
  calls: RecordedCall[];
  callsFor(model: ModelName): RecordedCall[];
}

// ── predefined behaviours ────────────────────────────────────────────────────────────────────
export const go = (confidence = 90, reasoning = 'Looks legitimate.'): MockBehavior => ({ type: 'success', verdict: 'GO', confidence, reasoning });
export const stop = (confidence = 90, reasoning = 'Looks like fraud.'): MockBehavior => ({ type: 'success', verdict: 'STOP', confidence, reasoning });
export const timeout: MockBehavior = { type: 'timeout' };
export const serverError: MockBehavior = { type: 'http_error', status: 500 };
export const rateLimited: MockBehavior = { type: 'http_error', status: 429 };
export const unauthorized: MockBehavior = { type: 'http_error', status: 401 };
export const networkError: MockBehavior = { type: 'network_error' };
export const garbage: MockBehavior = { type: 'raw', content: 'I cannot decide, sorry.' };
export const slow = (delayMs: number, then: MockBehavior = go()): MockBehavior => ({ type: 'slow', delayMs, then });
export const sequence = (...steps: MockBehavior[]): MockBehavior => ({ type: 'sequence', steps });

const completion = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });

function abortable<T>(signal: AbortSignal | null | undefined, work: () => Promise<T>, neverSettle = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    if (!neverSettle) work().then(resolve, reject);
  });
}

async function play(behavior: MockBehavior, signal: AbortSignal | null | undefined, state: { n: number }): Promise<Response> {
  switch (behavior.type) {
    case 'success':
      return completion(JSON.stringify({ verdict: behavior.verdict, confidence: behavior.confidence ?? 90, reasoning: behavior.reasoning ?? 'mock' }));
    case 'raw':
      return completion(behavior.content);
    case 'http_error':
      return new Response(JSON.stringify({ error: 'mock error' }), { status: behavior.status });
    case 'network_error':
      throw new TypeError('fetch failed');
    case 'timeout':
      return abortable<Response>(signal, async () => completion(''), true);
    case 'slow':
      return abortable(signal, async () => {
        await new Promise((r) => setTimeout(r, behavior.delayMs));
        return play(behavior.then, signal, state);
      });
    case 'sequence': {
      const step = behavior.steps[Math.min(state.n, behavior.steps.length - 1)];
      state.n++;
      return play(step, signal, state);
    }
  }
}

/** Builds a fetch that serves each model from its scripted behaviour (default: a GO answer). */
export function createMockFetch(behaviors: Partial<Record<ModelName, MockBehavior>> = {}): MockFetch {
  const states: Record<string, { n: number }> = { kimi: { n: 0 }, qwen: { n: 0 }, jev: { n: 0 } };
  const calls: RecordedCall[] = [];

  const mock = (async (input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response> => {
    const url = String(input);
    const model = (Object.keys(MOCK_ENDPOINTS) as ModelName[]).find((m) => url.startsWith(MOCK_ENDPOINTS[m]));
    if (!model) throw new Error(`mock fetch: unexpected URL ${url}`);
    calls.push({ model, url, headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body ?? '{}')) });
    return play(behaviors[model] ?? go(), init?.signal, states[model]);
  }) as MockFetch;

  mock.calls = calls;
  mock.callsFor = (model) => calls.filter((c) => c.model === model);
  return mock;
}

/** Model configs pointing at the mock endpoints, with short timeouts and no real backoff delay. */
export function mockModelConfigs(overrides: Partial<Record<ModelName, Partial<ModelConfig>>> = {}): Record<ModelName, ModelConfig> {
  const base = { timeout: 50, retries: 2, retryBaseDelayMs: 1000 };
  return {
    kimi: { name: 'kimi', requiresApiKey: true, apiKey: 'kimi-secret-key', endpoint: MOCK_ENDPOINTS.kimi, model: 'kimi-mock', weight: 0.5, ...base, ...overrides.kimi },
    qwen: { name: 'qwen', requiresApiKey: true, apiKey: 'qwen-secret-key', endpoint: MOCK_ENDPOINTS.qwen, model: 'qwen-mock', weight: 0.3, ...base, ...overrides.qwen },
    jev: { name: 'jev', requiresApiKey: false, endpoint: MOCK_ENDPOINTS.jev, model: 'jev-mock', weight: 0.2, ...base, ...overrides.jev },
  };
}

/** A valid intent for tests. Vary `amount` to get distinct cache keys. */
export const sampleIntent = (overrides: Record<string, unknown> = {}): PaymentIntent => ({
  from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  to: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  amount: '12500000000000000000',
  token: 'AUSD',
  context: 'Paying invoice #42 for two hours of GPU compute',
  ...overrides,
} as PaymentIntent);
