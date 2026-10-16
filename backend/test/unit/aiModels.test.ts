import { describe, expect, it } from '@jest/globals';
import { aiModels, buildModelConfigs, CACHE_TTL_MS, MIN_MODELS, MODEL_WEIGHTS } from '../../src/config/aiModels.js';

const settings = {
  timeoutMs: 10_000, maxRetries: 2, retryBaseMs: 1000,
  kimi: { apiKey: 'k', baseUrl: 'https://kimi.example/v1', model: 'kimi-x' },
  qwen: { apiKey: 'q', baseUrl: 'https://qwen.example/v1', model: 'qwen-x' },
  jev: { apiKey: '', baseUrl: 'https://jev.example/v1', model: 'jev-x' },
};

describe('AI model configuration', () => {
  it('uses the specified weights, which sum to 1', () => {
    expect(MODEL_WEIGHTS).toEqual({ kimi: 0.5, qwen: 0.3, jev: 0.2 });
    expect(Object.values(MODEL_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('builds per-model settings: 10s timeout, 2 retries, key required for Kimi/Qwen only', () => {
    const cfg = buildModelConfigs(settings);
    expect(cfg.kimi).toMatchObject({ name: 'kimi', apiKey: 'k', endpoint: 'https://kimi.example/v1', model: 'kimi-x', timeout: 10_000, weight: 0.5, retries: 2, retryBaseDelayMs: 1000, requiresApiKey: true });
    expect(cfg.qwen).toMatchObject({ weight: 0.3, requiresApiKey: true });
    expect(cfg.jev).toMatchObject({ weight: 0.2, requiresApiKey: false, apiKey: undefined });
  });

  it('defaults come from the validated environment', () => {
    expect(aiModels.kimi.timeout).toBe(10_000);
    expect(aiModels.kimi.retries).toBe(2);
  });

  it('exposes the cache TTL and quorum constants', () => {
    expect(CACHE_TTL_MS).toBe(300_000);
    expect(MIN_MODELS).toBe(2);
  });
});
