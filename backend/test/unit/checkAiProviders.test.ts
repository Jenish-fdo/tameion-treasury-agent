import { describe, expect, it, jest } from '@jest/globals';
import { checkProviders } from '../../scripts/check-ai-providers.js';

const SECRET = 'sk-super-secret-value-123456';
const fullEnv = {
  KIMI_API_KEY: SECRET, KIMI_BASE_URL: 'https://api.moonshot.ai/v1', KIMI_MODEL: 'kimi-x',
  QWEN_API_KEY: SECRET, QWEN_BASE_URL: 'https://qwen.example/compatible-mode/v1', QWEN_MODEL: 'qwen-x',
  JEV_API_KEY: SECRET, JEV_BASE_URL: 'https://gateway.example/v1', JEV_MODEL: 'jev-x',
};
const row = (rows: Awaited<ReturnType<typeof checkProviders>>['rows'], name: string) => rows.find((r) => r.Provider === name)!;
const okResponse = () => new Response('{"secret-echo":"' + SECRET + '"}', { status: 200 });

describe('check-ai-providers', () => {
  it('makes NO network calls unless the smoke test is requested', async () => {
    const fetchSpy = jest.fn(async () => okResponse());
    const { rows, failed } = await checkProviders(fullEnv, false, fetchSpy);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(failed).toBe(false);
    expect(rows.map((r) => [r.Provider, r.Configured, r['Smoke test']])).toEqual([
      ['Kimi', 'yes', 'skipped'], ['Qwen', 'yes', 'skipped'], ['Jev', 'yes', 'skipped'],
    ]);
  });

  it('reports what is missing by variable NAME only', async () => {
    const { rows } = await checkProviders({ KIMI_API_KEY: SECRET }, false, jest.fn(async () => okResponse()));
    expect(row(rows, 'Kimi')).toMatchObject({ Configured: 'no', 'Base URL present': 'yes', 'Model configured': 'no', Notes: 'missing: KIMI_MODEL' });
    expect(row(rows, 'Qwen')).toMatchObject({ Configured: 'no', 'Base URL present': 'no', Notes: 'missing: QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL' });
    expect(row(rows, 'Jev').Notes).toBe('missing: JEV_BASE_URL, JEV_MODEL'); // Jev's key is optional
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  it('treats an invalid base URL as missing', async () => {
    const { rows } = await checkProviders({ ...fullEnv, QWEN_BASE_URL: 'not a url' }, false, jest.fn(async () => okResponse()));
    expect(row(rows, 'Qwen')).toMatchObject({ Configured: 'no', 'Base URL present': 'no', Notes: 'missing: QWEN_BASE_URL (not a valid URL)' });
  });

  it('smoke test: sends one tiny authenticated request per configured provider and never leaks secrets', async () => {
    const fetchSpy = jest.fn(async (_url: string, _init: RequestInit) => okResponse());
    const { rows, failed } = await checkProviders(fullEnv, true, fetchSpy);
    expect(failed).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'kimi-x', max_tokens: 1 });
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${SECRET}`);
    expect(init.signal).toBeDefined();
    expect(rows.every((r) => r['Smoke test'] === 'success' && r['HTTP status'] === '200')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  it.each([
    [401, /authentication rejected/], [404, /not found/], [429, /rate limited/], [500, /server error/], [302, /redirect/], [418, /unexpected/],
  ])('smoke test: HTTP %i fails with a safe fixed summary (provider body never shown)', async (status, summary) => {
    const fetchSpy = jest.fn(async () => new Response(`{"error":"echo ${SECRET}"}`, { status }));
    const { rows, failed } = await checkProviders(fullEnv, true, fetchSpy);
    expect(failed).toBe(true);
    expect(row(rows, 'Kimi')).toMatchObject({ 'Smoke test': 'failed', 'HTTP status': String(status) });
    expect(row(rows, 'Kimi').Notes).toMatch(summary);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  it('smoke test: network errors and timeouts are summarised without error details', async () => {
    const boom = jest.fn(async () => { throw new TypeError(`connect failed for key ${SECRET}`); });
    const timeoutErr = jest.fn(async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); });
    const a = await checkProviders(fullEnv, true, boom);
    const b = await checkProviders(fullEnv, true, timeoutErr);
    expect(row(a.rows, 'Kimi').Notes).toMatch(/network error/);
    expect(row(b.rows, 'Kimi').Notes).toMatch(/timed out/);
    expect(a.failed && b.failed).toBe(true);
    expect(JSON.stringify([a.rows, b.rows])).not.toContain(SECRET);
  });

  it('fails only for configured providers: unconfigured ones are skipped, not failed', async () => {
    const fetchSpy = jest.fn(async () => okResponse());
    const { rows, failed } = await checkProviders({ KIMI_API_KEY: SECRET, KIMI_MODEL: 'kimi-x' }, true, fetchSpy);
    expect(failed).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(row(rows, 'Qwen')['Smoke test']).toBe('skipped');
    expect(row(rows, 'Qwen').Notes).toContain('smoke test skipped');
  });

  it('refuses to send a key over plain http to a non-local host, but allows localhost', async () => {
    const fetchSpy = jest.fn(async () => okResponse());
    const insecure = await checkProviders({ ...fullEnv, KIMI_BASE_URL: 'http://remote.example/v1' }, true, fetchSpy);
    expect(row(insecure.rows, 'Kimi')).toMatchObject({ 'Smoke test': 'failed', 'HTTP status': '-' });
    expect(fetchSpy).toHaveBeenCalledTimes(2); // only Qwen and Jev
    const local = await checkProviders({ ...fullEnv, KIMI_BASE_URL: 'http://localhost:9999/v1' }, true, fetchSpy);
    expect(row(local.rows, 'Kimi')['Smoke test']).toBe('success');
  });

  it('does not claim the direct TypeSafe API works: Jev smoke test is skipped for api.typesafe.ai', async () => {
    const fetchSpy = jest.fn(async () => okResponse());
    const { rows, failed } = await checkProviders({ ...fullEnv, JEV_BASE_URL: 'https://api.typesafe.ai' }, true, fetchSpy);
    expect(failed).toBe(false);
    expect(row(rows, 'Jev')['Smoke test']).toBe('skipped');
    expect(row(rows, 'Jev').Notes).toMatch(/not OpenAI-compatible/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('the test environment itself blocks real network access', async () => {
    await expect(fetch('https://api.moonshot.ai/v1/models')).rejects.toThrow('Network access is disabled in tests');
  });
});
