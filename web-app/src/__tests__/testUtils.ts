import type { PaymentCheckResult } from '@/lib/api';

/** Raw backend payload (before normalisation) for a given verdict. */
export function rawResult(verdict: 'GO' | 'STOP' | 'REVIEW', patch: Record<string, unknown> = {}) {
  const go = { success: true, verdict: 'GO', confidence: 88, reasoning: 'Looks like a normal invoice payment.', latencyMs: 420, attempts: 1 };
  const stop = { success: true, verdict: 'STOP', confidence: 91, reasoning: 'Urgency and secrecy are classic scam signals.', latencyMs: 380, attempts: 1 };
  const mix: Record<string, [object, object, object]> = {
    GO: [go, go, go],
    STOP: [stop, stop, stop],
    REVIEW: [go, stop, { success: false, error: 'timeout', latencyMs: 8000, attempts: 2 }],
  };
  const [kimi, qwen, jev] = mix[verdict];
  return {
    verdict,
    isSafeToProceed: verdict === 'GO',
    recommendedAction: verdict === 'GO' ? 'No elevated risk detected. You may proceed, but verify the recipient.' : 'Do not send this payment.',
    confidence: 87.5,
    agreement: verdict === 'REVIEW' ? 0.63 : 1,
    votes: { GO: 3, STOP: 0 },
    modelResults: [{ model: 'kimi', ...kimi }, { model: 'qwen', ...qwen }, { model: 'jev', ...jev }],
    intentHash: 'a'.repeat(64),
    cached: false,
    flags: [],
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

/** Minimal fetch Response stand-in (jsdom has no Response). */
export const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

export type { PaymentCheckResult };
