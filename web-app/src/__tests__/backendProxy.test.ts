/** @jest-environment node */
import { GET, POST } from '@/app/api/backend/[...path]/route';

const ID = `0x${'ab'.repeat(32)}`;
const KEY = 'proxy-test-key-0123456789abcdef';

const upstream = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fetchMock = () => globalThis.fetch as unknown as jest.Mock;
const get = (path: string, search = '') => GET(new Request(`http://localhost/api/backend/${path}${search}`), { params: { path: path.split('/') } });
const post = (path: string, body: string | object = {}, init: { raw?: boolean } = {}) =>
  POST(new Request(`http://localhost/api/backend/${path}`, { method: 'POST', body: init.raw ? (body as string) : JSON.stringify(body) }), { params: { path: path.split('/') } });

beforeEach(() => {
  process.env.CREDENTIA_API_KEY = KEY;
  process.env.CREDENTIA_API_URL = 'http://backend.test:3001/';
  delete process.env.NEXT_PUBLIC_API_VERSION;
});
afterEach(() => {
  delete process.env.CREDENTIA_API_KEY;
  delete process.env.CREDENTIA_API_URL;
});

describe('/api/backend proxy: what it allows', () => {
  it.each([
    ['GET', 'businesses/owners'], ['GET', `businesses/${ID}`], ['GET', 'mandates'], ['GET', `mandates/${ID}`],
    ['GET', 'decisions'], ['GET', `decisions/${ID}`], ['GET', 'approvals/pending'],
  ])('forwards %s %s', async (_m, path) => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(200, { ok: true })) as unknown as typeof fetch;
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it.each([['businesses'], ['mandates'], [`mandates/${ID}/revoke`], [`mandates/${ID}/validate`], [`mandates/${ID}/pay`]])('forwards POST %s', async (path) => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(201, { ok: true })) as unknown as typeof fetch;
    expect((await post(path)).status).toBe(200);
  });

  it('refuses everything else with a plain 404, without calling the backend', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const refused = [
      await post('decisions', { businessId: ID }), // agents write decisions with their own credentials
      await post(`decisions/${ID}`),
      await get('health'),
      await get('credential/mint'),
      await get('intent/evaluate'),
      await post(`mandates/${ID}/consume`),
      await get('mandates/not-an-id'),
      await get('businesses/owners/extra'),
      await get(`mandates/${ID}/validate`), // validate is POST only
    ];
    for (const res of refused) {
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    }
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('refuses path tricks', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    for (const segs of [['..', 'health'], ['mandates', '..', 'x'], ['mandates%2F..'], ['a b'], ['mandates', '']]) {
      const res = await GET(new Request('http://localhost/api/backend/x'), { params: { path: segs } });
      expect(res.status).toBe(404);
    }
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe('/api/backend proxy: what it sends', () => {
  it('adds the server-side API key, forwards the query string, and builds the backend URL', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(200, { items: [] })) as unknown as typeof fetch;
    await get('mandates', `?businessId=${ID}&limit=20`);
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe(`http://backend.test:3001/api/v1/mandates?businessId=${ID}&limit=20`);
    expect(init.headers['x-api-key']).toBe(KEY);
    expect(init.redirect).toBe('error');
    expect(init.method).toBe('GET');
  });

  it('forwards a POST body as normalised JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(201, { ok: true })) as unknown as typeof fetch;
    await post(`mandates/${ID}/validate`, '{ "agent" :  "0x1" }', { raw: true });
    expect(fetchMock().mock.calls[0][1].body).toBe('{"agent":"0x1"}');
    expect(fetchMock().mock.calls[0][1].method).toBe('POST');
  });

  it('rejects odd query strings, non-JSON bodies, arrays and oversized bodies before the backend', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    expect((await get('mandates', '?a=b;drop')).status).toBe(400); // characters outside the allowed set
    expect((await post('mandates', 'not json', { raw: true })).status).toBe(400);
    expect((await post('mandates', '[1,2]', { raw: true })).status).toBe(400);
    expect((await post('mandates', 'x'.repeat(30_000), { raw: true })).status).toBe(413);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('answers 503 when the server has no API key, without calling the backend', async () => {
    delete process.env.CREDENTIA_API_KEY;
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const res = await get('mandates');
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('API_KEY_NOT_CONFIGURED');
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe('/api/backend proxy: what comes back', () => {
  it('passes named errors through with their status', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(409, { error: { code: 'MANDATE_NOT_ACTIVE', message: 'The mandate is not active' }, requestId: 'r1' })) as unknown as typeof fetch;
    const res = await post(`mandates/${ID}/revoke`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'MANDATE_NOT_ACTIVE', message: 'The mandate is not active' } });
  });

  it('keeps field hints only for validation errors, and trims them', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'agent', message: 'bad', extra: 'x' }, { field: 7 }] },
    })) as unknown as typeof fetch;
    const res = await post('mandates', {});
    expect(await res.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'agent', message: 'bad' }] } });

    globalThis.fetch = jest.fn().mockResolvedValue(upstream(409, { error: { code: 'OTHER', message: 'm', details: [{ field: 'a', message: 'b' }] } })) as unknown as typeof fetch;
    expect((await (await post('mandates', {})).json()).error.details).toBeUndefined();
  });

  it('never leaks upstream internals or the API key', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(500, {
      error: { code: 'weird code with spaces', message: 'm'.repeat(1000) },
      stack: 'at secret.ts:1', rpc: 'http://internal-rpc', key: KEY,
    })) as unknown as typeof fetch;
    const res = await get('mandates');
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(502);
    expect(text).not.toContain('secret.ts');
    expect(text).not.toContain('internal-rpc');
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text).error.code).toBe('UPSTREAM_ERROR');
    expect(JSON.parse(text).error.message.length).toBeLessThanOrEqual(300);
  });

  it('answers 502 when the backend is unreachable or sends junk', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5')) as unknown as typeof fetch;
    const down = await get('mandates');
    expect(down.status).toBe(502);
    expect(JSON.stringify(await down.json())).not.toContain('10.0.0.5');

    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('html'); } }) as unknown as typeof fetch;
    expect((await get('mandates')).status).toBe(502);
  });

  it('keeps 202 (pending confirmation) distinct from 200', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(upstream(202, { status: 'pending' })) as unknown as typeof fetch;
    expect((await post('mandates', {})).status).toBe(202);
  });
});
