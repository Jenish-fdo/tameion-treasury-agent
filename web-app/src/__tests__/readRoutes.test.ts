/** @jest-environment node */
import { GET as getCredential } from '@/app/api/credential/[id]/route';
import { GET as getCreds } from '@/app/api/agent-credentials/[address]/route';
import { GET as getTrust } from '@/app/api/trust-score/[address]/route';

const KEY = 'server-only-secret-key-0123456789';
const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ID = `0x${'ab'.repeat(32)}`;
const upstream = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json }) as unknown as Response;
const fetchMock = () => globalThis.fetch as unknown as jest.Mock;
const req = new Request('http://localhost:3000/x');

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['CREDENTIA_API_KEY', 'CREDENTIA_API_URL']) saved[k] = process.env[k];
  process.env.CREDENTIA_API_KEY = KEY;
  process.env.CREDENTIA_API_URL = 'http://backend.test:3001';
});
afterEach(() => {
  for (const k of ['CREDENTIA_API_KEY', 'CREDENTIA_API_URL']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('read-only proxy routes', () => {
  it.each([
    ['trust-score', () => getTrust(req, { params: { address: ADDR } }), `/api/v1/trust-score/${ADDR}`],
    ['agent credentials', () => getCreds(req, { params: { address: ADDR } }), `/api/v1/agent/${ADDR}/credentials`],
    ['credential verification', () => getCredential(req, { params: { id: ID } }), `/api/v1/credential/${ID}/verify`],
  ])('%s: forwards with the server-held key and returns the JSON', async (_n, call, path) => {
    fetchMock().mockResolvedValue(upstream(200, { ok: true }));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe(`http://backend.test:3001${path}`);
    expect(init.headers['x-api-key']).toBe(KEY);
    expect(init.redirect).toBe('error');
  });

  it.each([
    ['address', () => getTrust(req, { params: { address: '0x123' } })],
    ['address', () => getCreds(req, { params: { address: 'nope' } })],
    ['credential id', () => getCredential(req, { params: { id: '0x1234' } })],
  ])('rejects a malformed %s with 400 and never calls the backend', async (_n, call) => {
    expect((await call()).status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('returns 401 without calling the backend when no key is configured', async () => {
    delete process.env.CREDENTIA_API_KEY;
    expect((await getTrust(req, { params: { address: ADDR } })).status).toBe(401);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('passes a 404 through with only its code, and hides everything else', async () => {
    fetchMock().mockResolvedValue(upstream(404, { error: { code: 'CREDENTIAL_NOT_FOUND', message: `secret ${KEY}`, details: { credentialId: ID } }, requestId: 'r' }));
    const res = await getCredential(req, { params: { id: ID } });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).toBe('{"error":{"code":"CREDENTIAL_NOT_FOUND"}}');
  });

  it('maps unknown upstream failures to 502 and unreachable backends to 502', async () => {
    fetchMock().mockResolvedValue(upstream(500, {}));
    expect((await getTrust(req, { params: { address: ADDR } })).status).toBe(502);
    fetchMock().mockRejectedValue(new TypeError(`ECONNREFUSED ${KEY}`));
    const res = await getTrust(req, { params: { address: ADDR } });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
  });
});
