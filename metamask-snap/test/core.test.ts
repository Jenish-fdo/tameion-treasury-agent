import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { demoProfile, lookupTrustProfile, type FetchLike } from '../src/services/credentiaApi';
import type { LookupResult, SnapConfig } from '../src/types/trust';
import { parseCaip2, supportedNetworkName } from '../src/utils/chain';
import { CATEGORY_MESSAGE, CATEGORY_TITLE, categorize } from '../src/utils/score';
import { extractRecipient } from '../src/utils/transaction';

const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const R_LOWER = RECIPIENT.toLowerCase();
const SENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CHAIN = 'eip155:10143';
const KEY = 'api-key-not-a-secret-but-never-logged-0123';
const pad = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const amount = pad('0xde0b6b3a7640000');

const cfg = (p: Partial<SnapConfig> = {}): SnapConfig => ({
  apiUrl: 'https://api.example.test', apiKey: KEY, timeoutMs: 50, networks: { 'eip155:10143': 'Monad Testnet' }, demoMode: false, ...p,
});
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const routes = (trust: [number, unknown], creds: [number, unknown]) =>
  jest.fn<FetchLike>(async (url) => (url.includes('/trust-score/') ? reply(...trust) : reply(...creds)));
const trustRaw = (score: number, p: Record<string, unknown> = {}) => ({ address: RECIPIENT, score, lastUpdated: 1_790_000_000, breakdown: {}, ...p });
const credsRaw = (n: number) => ({
  credentials: Array.from({ length: n }, (_, i) => ({ credentialId: `0x${String(i + 1).repeat(64)}`, issuer: SENDER, credentialType: 'KYC', isRevoked: false, expiresAt: 0 })),
});

describe('recipient extraction', () => {
  it('native transfer', () => {
    expect(extractRecipient({ from: SENDER, to: RECIPIENT, value: '0x1' })).toEqual({ ok: true, kind: 'native', recipient: R_LOWER });
  });
  it('native transfer with optional fields (gas, nonce, type, empty data)', () => {
    const tx = { from: SENDER, to: RECIPIENT, value: '0xde0b6b3a7640000', data: '0x', gas: '0x5208', maxFeePerGas: '0x1', nonce: '0x3', type: '0x2', chainId: '0x279f' };
    expect(extractRecipient(tx)).toEqual({ ok: true, kind: 'native', recipient: R_LOWER });
    expect(extractRecipient({ to: RECIPIENT })).toEqual({ ok: true, kind: 'native', recipient: R_LOWER });
    expect(extractRecipient({ to: RECIPIENT, data: null })).toMatchObject({ kind: 'native' });
  });
  it('ERC-20 transfer: the recipient comes from calldata, not the token contract', () => {
    const data = `0xa9059cbb${pad(RECIPIENT)}${amount}`;
    expect(extractRecipient({ from: SENDER, to: TOKEN, data })).toEqual({ ok: true, kind: 'erc20-transfer', recipient: R_LOWER, contract: TOKEN.toLowerCase() });
  });
  it('ERC-20 transferFrom: the second argument is the recipient', () => {
    const data = `0x23b872dd${pad(SENDER)}${pad(RECIPIENT)}${amount}`;
    expect(extractRecipient({ to: TOKEN, data })).toMatchObject({ kind: 'erc20-transfer', recipient: R_LOWER });
  });
  it('rejects ERC-20 calldata whose address word is malformed or truncated', () => {
    expect(extractRecipient({ to: TOKEN, data: `0xa9059cbb${'f'.repeat(24)}${RECIPIENT.slice(2)}${amount}` })).toEqual({ ok: false, reason: 'invalid-address' });
    expect(extractRecipient({ to: TOKEN, data: `0xa9059cbb${pad(RECIPIENT)}` })).toMatchObject({ kind: 'contract-call', recipient: null });
  });
  it('other contract calls have no person recipient; creation has none either', () => {
    expect(extractRecipient({ to: TOKEN, data: '0x095ea7b3' + pad(RECIPIENT) + amount })).toEqual({ ok: true, kind: 'contract-call', recipient: null, contract: TOKEN.toLowerCase() });
    expect(extractRecipient({ data: '0x6080604052' })).toEqual({ ok: true, kind: 'contract-creation', recipient: null });
  });
  it.each([
    [{ to: '0x123' }, 'invalid-address'], [{ to: 'nope' }, 'invalid-address'], [{ to: `${RECIPIENT}00` }, 'invalid-address'],
    [{ to: 5 }, 'invalid-address'], [{}, 'invalid-payload'], [null, 'invalid-payload'], ['x', 'invalid-payload'], [[], 'invalid-payload'],
    [{ to: RECIPIENT, data: 12 }, 'invalid-payload'], [{ to: RECIPIENT, data: '0xzz' }, 'invalid-payload'], [{ to: RECIPIENT, data: '0xabc' }, 'invalid-payload'],
  ])('invalid payload %j -> %s', (tx, reason) => {
    expect(extractRecipient(tx)).toEqual({ ok: false, reason });
  });
});

describe('CAIP-2 chains', () => {
  it.each([['eip155:1', 1], ['eip155:10143', 10143], ['eip155:143', 143]])('parses %s', (id, n) => expect(parseCaip2(id)).toBe(n));
  it.each(['eip155:0', 'eip155:', 'eip155:-1', 'eip155:01', 'eip155:1.5', 'eip155:1e3', 'cosmos:cosmoshub-4', 'solana:abc', '10143', '', null, 5, 'eip155:99999999999999999999'])(
    'rejects %j', (id) => expect(parseCaip2(id)).toBeNull()
  );
  it('only configured chains are supported', () => {
    const nets = { 'eip155:10143': 'Monad Testnet' };
    expect(supportedNetworkName('eip155:10143', nets)).toBe('Monad Testnet');
    expect(supportedNetworkName('eip155:143', nets)).toBeNull();
    expect(supportedNetworkName('eip155:1', nets)).toBeNull();
    expect(supportedNetworkName('__proto__', nets)).toBeNull();
    expect(supportedNetworkName('eip155:toString', nets)).toBeNull();
  });
});

describe('score categories', () => {
  it.each([[0, 'LOW'], [18, 'LOW'], [30, 'LOW'], [31, 'LIMITED'], [47, 'LIMITED'], [60, 'LIMITED'], [61, 'STRONGER'], [78, 'STRONGER'], [100, 'STRONGER']])('%i -> %s', (s, c) =>
    expect(categorize(s, true)).toBe(c)
  );
  it('an unscored address is UNKNOWN, never LOW', () => expect(categorize(0, false)).toBe('UNKNOWN'));
  it('wording is qualified: never "trusted", "guaranteed", "fraud-free" or "verified payment"', () => {
    const all = JSON.stringify([CATEGORY_TITLE, CATEGORY_MESSAGE]).toLowerCase();
    for (const banned of ['trusted', 'guarantee', 'fraud-free', 'verified payment', 'is safe', 'safe recipient']) expect(all).not.toContain(banned);
    expect(CATEGORY_MESSAGE.LOW.join(' ')).toMatch(/Verify the recipient before signing/);
  });
});

describe('lookup: success states', () => {
  const ok = (r: LookupResult) => (r.kind === 'ok' ? r : (() => { throw new Error(`expected ok, got ${r.kind}`); })());
  it.each([[18, 0, 'LOW'], [47, 1, 'LIMITED'], [78, 3, 'STRONGER']])('score %i with %i credentials -> %s', async (score, n, category) => {
    const r = ok(await lookupTrustProfile(cfg(), RECIPIENT, CHAIN, routes([200, trustRaw(score)], [200, credsRaw(n)])));
    expect(r.network).toBe('Monad Testnet');
    expect(r.profile).toMatchObject({ address: R_LOWER, score, category, activeCredentialCount: n, updatedAt: 1_790_000_000, source: 'live' });
  });
  it('counts only ACTIVE credentials', async () => {
    const creds = { credentials: [...credsRaw(1).credentials, { credentialId: `0x${'9'.repeat(64)}`, issuer: SENDER, isRevoked: true }, { credentialId: `0x${'8'.repeat(64)}`, issuer: SENDER, isRevoked: false, expiresAt: 5 }] };
    const r = ok(await lookupTrustProfile(cfg(), RECIPIENT, CHAIN, routes([200, trustRaw(60)], [200, creds])));
    expect(r.profile.credentials?.map((c) => c.status)).toEqual(['ACTIVE', 'REVOKED', 'EXPIRED']);
    expect(r.profile.activeCredentialCount).toBe(1);
  });
  it('shows the score but marks credentials as unknown (null, not 0) when only the credentials call fails', async () => {
    const r = ok(await lookupTrustProfile(cfg(), RECIPIENT, CHAIN, routes([200, trustRaw(47)], [500, {}])));
    expect(r.profile.activeCredentialCount).toBeNull();
    expect(r.profile.credentials).toBeUndefined();
  });
  it('a never-scored address is UNKNOWN', async () => {
    const r = ok(await lookupTrustProfile(cfg(), RECIPIENT, CHAIN, routes([200, trustRaw(0, { lastUpdated: 0 })], [200, credsRaw(0)])));
    expect(r.profile.category).toBe('UNKNOWN');
    expect(r.profile.updatedAt).toBeUndefined();
  });
});

describe('lookup: failure states are never a trust signal', () => {
  const reason = async (f: FetchLike, c = cfg()) => lookupTrustProfile(c, RECIPIENT, CHAIN, f);
  it.each([[401, 'auth'], [403, 'auth'], [429, 'rate_limited'], [500, 'server'], [503, 'server'], [404, 'bad_response'], [400, 'bad_response']])('HTTP %i -> unavailable(%s)', async (status, why) => {
    expect(await reason(routes([status, { error: `secret ${KEY}` }], [status, {}]))).toEqual({ kind: 'unavailable', reason: why, network: 'Monad Testnet' });
  });
  it('timeout', async () => {
    const hang: FetchLike = (_u, i) => new Promise((_r, rej) => i.signal.addEventListener('abort', () => rej(new Error('x'))));
    expect(await reason(hang)).toMatchObject({ kind: 'unavailable', reason: 'timeout' });
  });
  it('network error', async () => {
    expect(await reason(jest.fn<FetchLike>().mockRejectedValue(new TypeError('ECONNREFUSED')))).toMatchObject({ kind: 'unavailable', reason: 'network' });
  });
  it.each([[null], ['x'], [{}], [trustRaw(NaN)], [{ ...trustRaw(50), score: 'high' }], [trustRaw(50, { address: SENDER })], [trustRaw(50, { address: 'nope' })]])('malformed trust payload %j', async (raw) => {
    expect(await reason(routes([200, raw], [200, credsRaw(0)]))).toMatchObject({ kind: 'unavailable', reason: 'bad_response' });
  });
  it('non-JSON body', async () => {
    const f: FetchLike = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
    expect(await reason(f)).toMatchObject({ kind: 'unavailable', reason: 'bad_response' });
  });
  it('missing configuration makes no request', async () => {
    const f = jest.fn<FetchLike>();
    expect(await reason(f, cfg({ apiUrl: '' }))).toMatchObject({ kind: 'unavailable', reason: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
  it('no failure result carries a profile, a score or any "trusted" flag', async () => {
    const r = await reason(routes([500, {}], [500, {}]));
    expect(r).not.toHaveProperty('profile');
    expect(JSON.stringify(r)).not.toMatch(/score|trusted|safe/i);
  });
  it('unsupported network and invalid address make no request', async () => {
    const f = jest.fn<FetchLike>();
    expect(await lookupTrustProfile(cfg(), RECIPIENT, 'eip155:1', f)).toEqual({ kind: 'unsupported-network', chainId: 'eip155:1' });
    expect(await lookupTrustProfile(cfg(), '0x123', CHAIN, f)).toEqual({ kind: 'invalid-address' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('privacy and secrets', () => {
  it('sends only the public recipient address: nothing from the transaction, and the key only as a header', async () => {
    const f = routes([200, trustRaw(50)], [200, credsRaw(0)]);
    await lookupTrustProfile(cfg(), RECIPIENT, CHAIN, f);
    const urls = f.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([`https://api.example.test/api/v1/trust-score/${R_LOWER}`, `https://api.example.test/api/v1/agent/${R_LOWER}/credentials`]);
    for (const [u, init] of f.mock.calls) {
      expect(u).not.toContain(KEY);
      expect(u).not.toContain(SENDER.toLowerCase());
      expect(init.method).toBe('GET');
      expect(init.headers['x-api-key']).toBe(KEY);
    }
  });
  it('omits the key header when none is configured', async () => {
    const f = routes([200, trustRaw(50)], [200, credsRaw(0)]);
    await lookupTrustProfile(cfg({ apiKey: undefined }), RECIPIENT, CHAIN, f);
    expect(f.mock.calls[0][1].headers).not.toHaveProperty('x-api-key');
  });
  it('demo mode never calls the API and is labelled demo (low / medium / high by last hex digit)', async () => {
    const f = jest.fn<FetchLike>();
    const p = async (addr: string) => (await lookupTrustProfile(cfg({ demoMode: true }), addr, CHAIN, f));
    expect((await p(`0x${'1'.repeat(39)}1`)) as never).toMatchObject({ profile: { score: 18, category: 'LOW', source: 'demo' } });
    expect((await p(`0x${'1'.repeat(39)}7`)) as never).toMatchObject({ profile: { score: 47, category: 'LIMITED', source: 'demo' } });
    expect((await p(`0x${'1'.repeat(39)}f`)) as never).toMatchObject({ profile: { score: 78, category: 'STRONGER', source: 'demo' } });
    expect(f).not.toHaveBeenCalled();
    expect(demoProfile(`0x${'1'.repeat(40)}`).source).toBe('demo');
  });
  it('the core source never logs, signs, or reads keys', () => {
    const core = ['services/credentiaApi.ts', 'utils/chain.ts', 'utils/transaction.ts', 'utils/score.ts', 'types/trust.ts', 'config.ts', 'handlers/onRpcRequest.ts', 'handlers/onTransaction.tsx', 'ui/components.tsx'].map((p) => path.join(__dirname, '../src', p));
    for (const f of core) {
      const code = readFileSync(f, 'utf8');
      expect(code).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toMatch(/privateKey|mnemonic|eth_sign|eth_sendTransaction|signMessage|snap_manageState|localStorage/);
    }
  });
});
