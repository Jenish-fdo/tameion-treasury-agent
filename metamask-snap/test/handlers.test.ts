import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onRpcRequest } from '../src/handlers/onRpcRequest';
import { onTransaction } from '../src/handlers/onTransaction';
import { parseNetworks } from '../src/config';

const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const R_LOWER = RECIPIENT.toLowerCase();
const SENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CHAIN = 'eip155:10143';
const KEY = 'build-time-key-0123456789-never-shown';
const pad = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');

type Res = { ok: boolean; status: number; json(): Promise<unknown> };
let fetchMock: jest.Mock<(url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Res>>;
const reply = (status: number, body: unknown): Res => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const trustRaw = (score: number, p: Record<string, unknown> = {}) => ({ address: RECIPIENT, score, lastUpdated: 1_790_000_000, breakdown: {}, ...p });
const credsRaw = (n: number) => ({
  credentials: Array.from({ length: n }, (_, i) => ({ credentialId: `0x${String(i + 1).repeat(64)}`, issuer: SENDER, credentialType: 'KYC Passed', isRevoked: false, expiresAt: 0 })),
});
const api = (score: number, creds: number) => fetchMock.mockImplementation(async (url) => (url.includes('/trust-score/') ? reply(200, trustRaw(score)) : reply(200, credsRaw(creds))));

const tx = (p: Record<string, unknown> = {}) => ({ from: SENDER, to: RECIPIENT, value: '0x1', data: '0x', gas: '0x5208', nonce: '0x0', ...p }) as never;
const run = async (p: Record<string, unknown> = {}, chainId = CHAIN) => (await onTransaction({ transaction: tx(p), chainId: chainId as never })) as { content: unknown; severity?: string };
const text = (r: { content: unknown } | null) => JSON.stringify(r?.content);

const envBefore = { ...process.env };
beforeEach(() => {
  process.env.CREDENTIA_API_URL = 'https://api.example.test';
  process.env.CREDENTIA_API_KEY = KEY;
  process.env.CREDENTIA_TIMEOUT_MS = '40';
  delete process.env.CREDENTIA_NETWORKS;
  delete process.env.CREDENTIA_DEMO_MODE;
  fetchMock = jest.fn();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(() => {
  process.env = { ...envBefore };
  jest.restoreAllMocks();
});

describe('onTransaction: trust states', () => {
  it.each([[18, 0, 'CREDENTIA / LOW TRUST', 'Verify the recipient before signing.'], [47, 1, 'CREDENTIA / LIMITED EVIDENCE', 'manual verification is recommended'], [78, 3, 'CREDENTIA / STRONGER EVIDENCE', 'Continue with normal payment caution.']])(
    'score %i -> %s', async (score, creds, title, line) => {
      api(score, creds);
      const out = await run();
      const t = text(out);
      expect(t).toContain(title);
      expect(t).toContain(`${score} / 100`);
      expect(t).toContain(`"${creds}"`);
      expect(t).toContain('Monad Testnet');
      expect(t).toContain('2026-');
      expect(t).toContain(line);
      expect(t).toContain('This signal does not guarantee transaction safety.');
    }
  );

  it('never blocks or flags: no severity is set, and no wording claims trust or safety', async () => {
    for (const [s, c] of [[18, 0], [47, 1], [78, 3]]) {
      api(s, c);
      const out = await run();
      expect(out).not.toHaveProperty('severity');
      expect(text(out).toLowerCase()).not.toMatch(/trusted|guaranteed safe|fraud-free|verified payment|is safe/);
    }
  });

  it('lists a credential summary and counts only active credentials', async () => {
    api(60, 2);
    const t = text(await run());
    expect(t).toContain('Credential summary');
    expect(t).toContain('KYC Passed (ACTIVE)');
  });

  it('shows "unavailable" (not 0) for credentials when only that call fails', async () => {
    fetchMock.mockImplementation(async (url) => (url.includes('/trust-score/') ? reply(200, trustRaw(47)) : reply(500, {})));
    const t = text(await run());
    expect(t).toContain('unavailable');
    expect(t).toContain('LIMITED EVIDENCE');
  });

  it('ERC-20 transfer: looks up the recipient in the calldata, not the token contract', async () => {
    api(47, 1);
    const data = `0xa9059cbb${pad(RECIPIENT)}${pad('0xde0b6b3a7640000')}`;
    const t = text(await run({ to: TOKEN, data, value: '0x0' }));
    expect(fetchMock.mock.calls[0][0]).toContain(R_LOWER);
    expect(fetchMock.mock.calls.every((c) => !c[0].includes(TOKEN.toLowerCase()))).toBe(true);
    expect(t).toContain('Token transfer: the recipient was read from the transaction data.');
  });

  it('other contract calls get a neutral note and no lookup', async () => {
    const t = text(await run({ to: TOKEN, data: `0x095ea7b3${pad(RECIPIENT)}${pad('0x1')}` }));
    expect(t).toContain('contract interaction');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the data timestamp "not recorded" when the API has none', async () => {
    fetchMock.mockImplementation(async (url) => (url.includes('/trust-score/') ? reply(200, trustRaw(0, { lastUpdated: 0 })) : reply(200, credsRaw(0))));
    const t = text(await run());
    expect(t).toContain('NO TRUST DATA');
    expect(t).toContain('not recorded');
  });
});

describe('onTransaction: neutral fallbacks (never a trust signal)', () => {
  const NO_SIGNAL = (t: string) => {
    expect(t).toContain('CREDENTIA / NO TRUST DATA');
    expect(t).toContain('not a sign the recipient is safe');
    expect(t).not.toMatch(/\d+ \/ 100|LOW TRUST|LIMITED EVIDENCE|STRONGER EVIDENCE/);
  };
  it.each([[401, 'rejected this Snap'], [403, 'rejected this Snap'], [429, 'rate limiting'], [500, 'reported a problem'], [503, 'reported a problem']])('HTTP %i', async (status, phrase) => {
    fetchMock.mockImplementation(async () => reply(status, { error: `secret ${KEY}` }));
    const t = text(await run());
    NO_SIGNAL(t);
    expect(t).toContain(phrase);
    expect(t).not.toContain(KEY);
  });
  it('timeout', async () => {
    fetchMock.mockImplementation((_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('x')))));
    const t = text(await run());
    NO_SIGNAL(t);
    expect(t).toContain('did not respond in time');
  });
  it('network failure and malformed responses', async () => {
    fetchMock.mockRejectedValue(new TypeError('ECONNREFUSED'));
    NO_SIGNAL(text(await run()));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => reply(200, { score: 'high' }));
    const t = text(await run());
    NO_SIGNAL(t);
    expect(t).toContain('unexpected response');
  });
  it('missing configuration makes no request', async () => {
    process.env.CREDENTIA_API_URL = '';
    const t = text(await run());
    NO_SIGNAL(t);
    expect(t).toContain('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('unsupported network: neutral message, no request', async () => {
    const out = await run({}, 'eip155:1');
    expect(text(out)).toContain('Credentia trust lookup is unavailable for this network.');
    expect(fetchMock).not.toHaveBeenCalled();
    const bad = await run({}, 'cosmos:cosmoshub-4');
    expect(text(bad)).toContain('unavailable for this network');
  });
  it('invalid or missing recipient: neutral message, no request', async () => {
    for (const p of [{ to: '0x123' }, { to: 'nope' }, { to: undefined, data: '0x' }]) {
      expect(text(await run(p))).toContain('could not read a valid recipient');
    }
    expect(text(await run({ to: undefined, data: '0x6080' }))).toContain('creates a contract');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('onTransaction: networks and demo mode', () => {
  it('mainnet is evaluated only when configured', async () => {
    api(78, 3);
    expect(text(await run({}, 'eip155:143'))).toContain('unavailable for this network');
    process.env.CREDENTIA_NETWORKS = 'eip155:10143=Monad Testnet,eip155:143=Monad';
    const t = text(await run({}, 'eip155:143'));
    expect(t).toContain('STRONGER EVIDENCE');
    expect(t).toContain('"Monad"');
  });
  it('parseNetworks ignores malformed entries and falls back to testnet', () => {
    expect(parseNetworks('garbage,eip155:x=Bad,=,eip155:143=')).toEqual({ 'eip155:10143': 'Monad Testnet' });
    expect(parseNetworks(undefined)).toEqual({ 'eip155:10143': 'Monad Testnet' });
    expect(parseNetworks('eip155:143=Monad')).toEqual({ 'eip155:143': 'Monad' });
  });
  it('demo mode renders low / medium / high clearly labelled and never calls the API', async () => {
    process.env.CREDENTIA_DEMO_MODE = 'true';
    const r = async (digit: string) => text(await run({ to: `0x${'1'.repeat(39)}${digit}` }));
    expect(await r('1')).toContain('LOW TRUST');
    expect(await r('7')).toContain('LIMITED EVIDENCE');
    expect(await r('f')).toContain('STRONGER EVIDENCE');
    expect(await r('f')).toContain('DEMO DATA');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('privacy and secrets', () => {
  it('sends only the public recipient (GET path), key only in a header, and nothing from the transaction', async () => {
    api(47, 1);
    await run({ value: '0xde0b6b3a7640000', data: '0x', nonce: '0x7' });
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toMatch(new RegExp(`^https://api.example.test/api/v1/(trust-score|agent)/${R_LOWER}`));
      expect(url).not.toContain(KEY);
      expect(url).not.toContain(SENDER.toLowerCase());
      expect(init.headers['x-api-key']).toBe(KEY);
    }
  });
  it('never logs and never puts the key in any output', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    for (const status of [200, 401, 500]) {
      fetchMock.mockImplementation(async (url) => reply(status, status === 200 ? (url.includes('/trust-score/') ? trustRaw(47) : credsRaw(1)) : { error: KEY }));
      expect(text(await run())).not.toContain(KEY);
    }
    const rpc = await onRpcRequest({ origin: 'https://dapp.example', originMetadata: null, request: { jsonrpc: '2.0', id: 1, method: 'credentia_getTrustProfile', params: { address: RECIPIENT } } });
    expect(JSON.stringify(rpc)).not.toContain(KEY);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe('onRpcRequest', () => {
  const rpc = (method: string, params?: unknown) => onRpcRequest({ origin: 'https://dapp.example', originMetadata: null, request: { jsonrpc: '2.0', id: 1, method, params } as never });

  it('credentia_getVersion', async () => {
    expect(await rpc('credentia_getVersion')).toEqual({ version: '0.1.0' });
  });
  it('credentia_getTrustProfile returns a normalised lookup, not the raw API response', async () => {
    api(47, 1);
    const out = (await rpc('credentia_getTrustProfile', { address: RECIPIENT, chainId: CHAIN })) as { kind: string; profile: Record<string, unknown>; network: string };
    expect(out).toMatchObject({ kind: 'ok', network: 'Monad Testnet', profile: { address: R_LOWER, score: 47, category: 'LIMITED', activeCredentialCount: 1, source: 'live' } });
    expect(out.profile).not.toHaveProperty('breakdown');
    expect(out.profile).not.toHaveProperty('scoreBps');
  });
  it('defaults the chain to the first configured network', async () => {
    api(18, 0);
    expect(await rpc('credentia_getTrustProfile', { address: RECIPIENT })).toMatchObject({ kind: 'ok', network: 'Monad Testnet' });
  });
  it('reports unsupported networks and API failures as results, not as trust', async () => {
    expect(await rpc('credentia_getTrustProfile', { address: RECIPIENT, chainId: 'eip155:1' })).toEqual({ kind: 'unsupported-network', chainId: 'eip155:1' });
    fetchMock.mockImplementation(async () => reply(500, {}));
    expect(await rpc('credentia_getTrustProfile', { address: RECIPIENT })).toEqual({ kind: 'unavailable', reason: 'server', network: 'Monad Testnet' });
  });
  it.each([['credentia_nope'], ['eth_sendTransaction'], ['credentia_getIdentity'], ['']])('rejects unknown method %j', async (m) => {
    await expect(rpc(m)).rejects.toMatchObject({ code: -32601 });
  });
  it.each([[undefined], [null], ['x'], [[]], [{}], [{ address: '0x123' }], [{ address: 5 }], [{ address: RECIPIENT, chainId: 5 }]])('rejects invalid params %j', async (params) => {
    await expect(rpc('credentia_getTrustProfile', params)).rejects.toMatchObject({ code: -32602 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
