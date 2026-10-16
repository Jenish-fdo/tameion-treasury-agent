import type { ModelConfig, ModelName } from '../types/ai.js';
import { config } from './index.js';

/** Consensus weights: Kimi 50%, Qwen 30%, Jev 20%. */
export const MODEL_WEIGHTS: Record<ModelName, number> = { kimi: 0.5, qwen: 0.3, jev: 0.2 };

/** Cached consensus results live for 5 minutes. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** At least this many models must answer for a verdict to be issued. */
export const MIN_MODELS = 2;

type ModelSettings = typeof config.models;

/**
 * Builds the per-model configuration from validated settings (see config/index.ts, which reads
 * KIMI_*, QWEN_*, JEV_*, MODEL_TIMEOUT_MS, MODEL_MAX_RETRIES, MODEL_RETRY_BASE_MS).
 * All three providers are called through an OpenAI-compatible `/chat/completions` endpoint.
 */
export function buildModelConfigs(settings: ModelSettings = config.models): Record<ModelName, ModelConfig> {
  const common = { timeout: settings.timeoutMs, retries: settings.maxRetries, retryBaseDelayMs: settings.retryBaseMs };
  return {
    kimi: { name: 'kimi', requiresApiKey: true, apiKey: settings.kimi.apiKey, endpoint: settings.kimi.baseUrl, model: settings.kimi.model, weight: MODEL_WEIGHTS.kimi, ...common },
    qwen: { name: 'qwen', requiresApiKey: true, apiKey: settings.qwen.apiKey, endpoint: settings.qwen.baseUrl, model: settings.qwen.model, weight: MODEL_WEIGHTS.qwen, ...common },
    // Jev's key is optional (e.g. a gateway that authenticates by network); its endpoint and model are required.
    jev: { name: 'jev', requiresApiKey: false, apiKey: settings.jev.apiKey || undefined, endpoint: settings.jev.baseUrl, model: settings.jev.model, weight: MODEL_WEIGHTS.jev, ...common },
  };
}

export const aiModels = buildModelConfigs();
