/** @jest-environment node */
import { POST } from '@/app/api/payment-check/route';

const SERVER_KEY = 'server-only-secret-key-0123456789';
const body = { from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', to: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', amount: '12500000000000000000', token: 'AUSD', context: 'Invoice #42' };
const post = (payload: unknown) => POST(new Request('http://localhost:3000/api/payment-check', { method: 'POST', body: typeof payload === 'string' ? payload : JSON.stringify(payload) }));
const upstream = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json }) as unknown as Response;
const fetchMock = () => globalThis.fetch as unknown as jest.Mock;

const ENV = ['CREDENTIA_API_KEY', 'CREDENTIA_API_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_API_VERSION'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.CREDENTIA_API_KEY = SERVER_KEY;
  process.env.CREDENTIA_API_URL = 'http://backend.test:3001/';
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('POST /api/payment-check (server-side proxy)', () => {
  it('forwards a valid request with the server-held API key and returns the backend result', async () => {
    fetchMock().mockResolvedValue(upstream(200, { verdict: 'GO', isSafeToProceed: true }));
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict: 'GO', isSafeToProceed: true });

    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('http://backend.test:3001/api/v1/intent/evaluate');
    expect(init.headers['x-api-key']).toBe(SERVER_KEY);
    expect(JSON.parse(init.body)).toEqual(body);
    expect(init.redirect).toBe('error');
  });

  it('falls back to NEXT_PUBLIC_API_URL and the configured API version', async () => {
    delete process.env.CREDENTIA_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://fallback.test:4000';
    process.env.NEXT_PUBLIC_API_VERSION = 'v2';
    fetchMock().mockResolvedValue(upstream(200, { verdict: 'STOP' }));
    await post(body);
    expect(fetchMock().mock.calls[0][0]).toBe('http://fallback.test:4000/api/v2/intent/evaluate');
  });

  it('returns 401 without calling the backend when no API key is configured', async () => {
    delete process.env.CREDENTIA_API_KEY;
    const res = await post(body);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'API_KEY_NOT_CONFIGURED' } });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{oops'],
    ['an invalid address', { ...body, to: '0x123' }],
    ['a decimal amount', { ...body, amount: '12.5' }],
    ['an unknown field', { ...body, apiKey: 'x' }],
    ['an over-long context', { ...body, context: 'x'.repeat(2001) }],
    ['a missing field', { from: body.from }],
  ])('rejects %s with 400 and never calls the backend', async (_name, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('passes through only the status and error code, never upstream messages, details or the key', async () => {
    fetchMock().mockResolvedValue(upstream(503, {
      error: { code: 'INSUFFICIENT_AI_MODELS', message: `internal: kimi key ${SERVER_KEY} failed`, details: [{ model: 'kimi' }] },
      requestId: 'abc',
    }));
    const res = await post(body);
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toBe('{"error":{"code":"INSUFFICIENT_AI_MODELS"}}');
    expect(text).not.toContain(SERVER_KEY);
  });

  it.each([[400, 400], [401, 401], [403, 403], [429, 429], [404, 502], [500, 502], [504, 502]])('maps upstream %i to %i', async (from, to) => {
    fetchMock().mockResolvedValue(upstream(from, { error: { code: 'X_CODE' } }));
    expect((await post(body)).status).toBe(to);
  });

  it('ignores a malformed upstream error code', async () => {
    fetchMock().mockResolvedValue(upstream(500, { error: { code: '<script>alert(1)</script>' } }));
    expect(await (await post(body)).json()).toEqual({ error: { code: 'UPSTREAM_ERROR' } });
  });

  it('returns 502 when the backend is unreachable or returns junk', async () => {
    fetchMock().mockRejectedValue(new TypeError(`connect ECONNREFUSED with ${SERVER_KEY}`));
    const down = await post(body);
    expect(down.status).toBe(502);
    expect(JSON.stringify(await down.json())).not.toContain(SERVER_KEY);

    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
    expect((await post(body)).status).toBe(502);
  });
});
