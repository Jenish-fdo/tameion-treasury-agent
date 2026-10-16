import type { CredentiaSDKConfig } from '../types';
import { CredentiaError, errorForStatus } from '../utils/errors';

const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Minimal GET client over fetch: timeout, cancellation, status mapping. Never logs, never echoes server text. */
export class HttpClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;

  constructor(config: Pick<CredentiaSDKConfig, 'apiUrl' | 'requestTimeoutMs' | 'apiKey'>, private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
    let url: URL;
    try {
      url = new URL(config.apiUrl);
    } catch {
      throw new CredentiaError('VALIDATION', 'apiUrl must be a valid http(s) URL.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CredentiaError('VALIDATION', 'apiUrl must be a valid http(s) URL.');
    this.base = url.origin + url.pathname.replace(/\/+$/, '');
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new CredentiaError('VALIDATION', 'requestTimeoutMs must be a positive number.');
    this.apiKey = config.apiKey;
  }

  async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      if (signal?.aborted) throw new CredentiaError('CANCELLED', 'The request was cancelled.');
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.apiKey) headers['x-api-key'] = this.apiKey;

      let res;
      try {
        res = await this.fetchImpl(`${this.base}${path}`, { method: 'GET', headers, signal: controller.signal });
      } catch {
        if (timedOut) throw new CredentiaError('TIMEOUT', 'The request timed out.');
        if (signal?.aborted) throw new CredentiaError('CANCELLED', 'The request was cancelled.');
        throw new CredentiaError('NETWORK', 'The Credentia API could not be reached.');
      }
      if (!res.ok) throw errorForStatus(res.status);
      try {
        return await res.json();
      } catch {
        throw new CredentiaError('BAD_RESPONSE', 'The API returned a response that is not valid JSON.', res.status);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
