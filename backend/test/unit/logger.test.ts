import { Writable } from 'node:stream';
import winston from 'winston';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AIModelResponse, ConsensusResult } from '../../src/types/ai.js';
import { auditLogger, logConsensusResult, logError, logModelCall, redact } from '../../src/utils/logger.js';
import { hashIntent } from '../../src/utils/intentHash.js';
import { sampleIntent } from '../mocks/mockAIModels.js';

const ok: AIModelResponse = { model: 'kimi', success: true, verdict: 'GO', confidence: 88, reasoning: 'fine', latencyMs: 120, attempts: 1 };
const failed: AIModelResponse = { model: 'qwen', success: false, error: 'timeout', latencyMs: 10_000, attempts: 3 };
const result = (patch: Partial<ConsensusResult> = {}): ConsensusResult => ({
  verdict: 'GO', isSafeToProceed: true, recommendedAction: 'ok', confidence: 80, agreement: 1, votes: { GO: 2, STOP: 0 }, modelResults: [ok, failed], intentHash: 'abc', cached: false,
  flags: [], evaluatedAt: '2026-01-01T00:00:00.000Z', ...patch,
});

describe('audit logger', () => {
  let info: jest.SpiedFunction<typeof auditLogger.info>;
  let warn: jest.SpiedFunction<typeof auditLogger.warn>;
  let error: jest.SpiedFunction<typeof auditLogger.error>;
  beforeEach(() => {
    info = jest.spyOn(auditLogger, 'info').mockImplementation((() => auditLogger) as never);
    warn = jest.spyOn(auditLogger, 'warn').mockImplementation((() => auditLogger) as never);
    error = jest.spyOn(auditLogger, 'error').mockImplementation((() => auditLogger) as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logModelCall: success => info with verdict, confidence, latency and the intent hash', () => {
    const intent = sampleIntent();
    logModelCall('kimi', intent, ok, 120);
    expect(info).toHaveBeenCalledWith('model_call', expect.objectContaining({
      event: 'model_call', model: 'kimi', verdict: 'GO', confidence: 88, latencyMs: 120, attempts: 1, success: true,
      intentHash: hashIntent(intent), from: intent.from, amount: intent.amount,
    }));
  });

  it('logModelCall: failure => warn with the failure reason; honours an explicit hash', () => {
    logModelCall('qwen', sampleIntent(), failed, 10_000, 'explicit-hash');
    expect(warn).toHaveBeenCalledWith('model_call', expect.objectContaining({ success: false, failure: 'timeout', intentHash: 'explicit-hash', attempts: 3 }));
  });

  it('never logs the free-text context, only its length', () => {
    logModelCall('kimi', sampleIntent({ context: 'my secret memo' }), ok, 1);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('my secret memo');
    expect(logged).toContain('"contextLength":14');
  });

  it('logConsensusResult: records cache hit/miss and a per-model summary', () => {
    logConsensusResult(sampleIntent(), result(), false);
    logConsensusResult(sampleIntent(), result({ cached: true }), true);
    expect(info).toHaveBeenNthCalledWith(1, 'consensus', expect.objectContaining({
      event: 'consensus', cacheHit: false, verdict: 'GO', confidence: 80, intentHash: 'abc',
      models: [
        { model: 'kimi', verdict: 'GO', confidence: 88, latencyMs: 120, attempts: 1 },
        { model: 'qwen', failure: 'timeout', latencyMs: 10_000, attempts: 3 },
      ],
    }));
    expect(info).toHaveBeenNthCalledWith(2, 'consensus', expect.objectContaining({ cacheHit: true }));
  });

  it('logConsensusResult: REVIEW and flagged results are logged at warn', () => {
    logConsensusResult(sampleIntent(), result({ verdict: 'REVIEW' }), false);
    logConsensusResult(sampleIntent(), result({ flags: ['PROMPT_INJECTION_SUSPECTED'] }), false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(info).not.toHaveBeenCalled();
  });

  it('logError: includes context and metadata, redacting credentials', () => {
    logError('ai-consensus', new Error('boom Bearer abc.def-123 and sk-ABCDEFGH12345'), {
      intentHash: 'abc', apiKey: 'super-secret', nested: { Authorization: 'Bearer zzz', ok: 1 },
    });
    const [, entry] = error.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(entry).toMatchObject({ event: 'error', context: 'ai-consensus', errorName: 'Error', intentHash: 'abc', apiKey: '[REDACTED]', nested: { Authorization: '[REDACTED]', ok: 1 } });
    expect(JSON.stringify(entry)).not.toMatch(/super-secret|abc\.def|ABCDEFGH|zzz/);
  });

  it('writes valid structured JSON with a timestamp through a real transport', () => {
    jest.restoreAllMocks();
    const chunks: string[] = [];
    const transport = new winston.transports.Stream({
      stream: new Writable({ write(chunk, _enc, done) { chunks.push(String(chunk)); done(); } }),
    });
    const levelBefore = auditLogger.level;
    auditLogger.level = 'info';
    auditLogger.transports.forEach((t) => { t.silent = true; }); // keep the console quiet
    auditLogger.add(transport);
    logConsensusResult(sampleIntent(), result(), true);
    auditLogger.remove(transport);
    auditLogger.transports.forEach((t) => { t.silent = false; });
    auditLogger.level = levelBefore;
    const entry = JSON.parse(chunks.join('').trim());
    expect(entry).toMatchObject({ level: 'info', message: 'consensus', event: 'consensus', cacheHit: true, stream: 'ai-consensus-audit' });
    expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
  });
});

describe('redact', () => {
  it('copies deeply, masks sensitive keys and leaves other values alone', () => {
    const input = { a: 1, list: [{ password: 'p', b: 'Bearer tok' }], deep: { x: { y: { z: { w: { v: 1 } } } } } };
    const out = redact(input) as any;
    expect(out.a).toBe(1);
    expect(out.list[0]).toEqual({ password: '[REDACTED]', b: '[REDACTED]' });
    expect(out.deep.x.y.z.w).toBe('[TRUNCATED]');
    expect(input.list[0].password).toBe('p'); // original untouched
    expect(redact(null)).toBeNull();
    expect(redact(5)).toBe(5);
  });
});
