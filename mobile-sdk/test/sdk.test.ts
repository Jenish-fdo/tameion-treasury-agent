import { describe, expect, it, jest } from '@jest/globals';
import { decodeFunctionData, keccak256, toBytes, zeroHash } from 'viem';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CredentiaSDK } from '../src/CredentiaSDK';
import { HttpClient, type FetchLike } from '../src/api/client';
import { categorize, normalizeTrustScore } from '../src/api/trustScore';
import { normalizeCredential, statusOf } from '../src/api/credentials';
import { CredentiaError, errorForStatus } from '../src/utils/errors';
import { assertAddress, assertCredentialId, assertExpiry, assertMetadataUri, isAddress } from '../src/utils/validation';
import { REGISTRY_ABI, credentialTypeToBytes32 } from '../src/utils/web3';

const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ISSUER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ID = `0x${'ab'.repeat(32)}`;
const API_KEY = 'super-secret-api-key-0123456789';
const FUTURE = Math.floor(Date.now() / 1000) + 86_400 * 30;

const trustRaw = (p: Record<string, unknown> = {}) => ({
  address: ADDR, score: 72, scoreBps: 7200, lastUpdated: 1_790_000_000,
  breakdown: { credentials: { points: 80, weightBps: 4000 }, attestations: { points: 65, weightBps: 3500 }, staking: { points: 62, weightBps: 2500 } }, ...p,
});
const credRaw = (p: Record<string, unknown> = {}) => ({
  credentialId: ID, valid: true, isRevoked: false, issuer: ISSUER, subject: ADDR, credentialType: 'KYC Passed', issuedAt: 1_780_000_000, expiresAt: FUTURE, metadataUri: 'https://example.com/m.json', ...p,
});

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fakeFetch = (status: number, body: unknown) => jest.fn<FetchLike>(async () => reply(status, body));
const sdkWith = (f: FetchLike, extra = {}) => new CredentiaSDK({ apiUrl: 'https://api.example.test', apiKey: API_KEY, requestTimeoutMs: 50, ...extra }, f);

describe('validation', () => {
  it('addresses and ids', () => {
    expect(isAddress(ADDR)).toBe(true);
    for (const bad of ['0x123', ADDR.slice(2), `${ADDR}00`, '', null, 5]) expect(isAddress(bad)).toBe(false);
    expect(() => assertAddress('nope')).toThrow(CredentiaError);
    expect(() => assertCredentialId('0x12')).toThrow(CredentiaError);
    expect(assertCredentialId(ID)).toBe(ID);
  });
  it('expiry: 0 or future, before 2100, integers only', () => {
    expect(assertExpiry(0)).toBe(0);
    expect(assertExpiry(FUTURE)).toBe(FUTURE);
    for (const bad of [-1, 1.5, 5, 4_102_444_801, NaN, '5' as unknown as number]) expect(() => assertExpiry(bad)).toThrow(CredentiaError);
  });
  it('metadata URI: https or ipfs only', () => {
    expect(assertMetadataUri(undefined)).toBeUndefined();
    expect(assertMetadataUri('ipfs://bafy')).toBe('ipfs://bafy');
    for (const bad of ['http://x.y', 'javascript:alert(1)', 'ftp://x', 'https://' + 'a'.repeat(2100)]) expect(() => assertMetadataUri(bad)).toThrow(CredentiaError);
  });
});

describe('normalisation', () => {
  it('trust score maps the real API shape', () => {
    expect(normalizeTrustScore(trustRaw())).toEqual({
      address: ADDR, score: 72, category: 'STRONGER', breakdown: { credentials: 80, attestations: 65, staking: 62 }, lastUpdated: 1_790_000_000, source: 'live',
    });
  });
  it.each([[0, true, 'LOW'], [30, true, 'LOW'], [31, true, 'LIMITED'], [60, true, 'LIMITED'], [61, true, 'STRONGER'], [100, true, 'STRONGER'], [0, false, 'UNKNOWN']])(
    'category(%i, scored=%s) = %s', (s, scored, c) => expect(categorize(s, scored as boolean)).toBe(c)
  );
  it('a never-scored address is UNKNOWN, not LOW; scores are clamped', () => {
    const t = normalizeTrustScore(trustRaw({ score: 0, lastUpdated: 0 }));
    expect(t.category).toBe('UNKNOWN');
    expect(t.lastUpdated).toBeUndefined();
    expect(normalizeTrustScore(trustRaw({ score: 900 })).score).toBe(100);
  });
  it.each([null, 'x', [], {}, trustRaw({ address: 'nope' }), trustRaw({ score: 'high' }), trustRaw({ score: NaN })])('rejects malformed trust payload %j', (raw) => {
    expect(() => normalizeTrustScore(raw)).toThrow(expect.objectContaining({ code: 'BAD_RESPONSE' }));
  });
  it('credential status: revoked > expired > active; no expiry is active', () => {
    const now = 1_800_000_000;
    expect(statusOf(true, now + 9, now)).toBe('REVOKED');
    expect(statusOf(false, now - 1, now)).toBe('EXPIRED');
    expect(statusOf(false, now, now)).toBe('EXPIRED');
    expect(statusOf(false, now + 1, now)).toBe('ACTIVE');
    expect(statusOf(false, undefined, now)).toBe('ACTIVE');
  });
  it('credential maps fields and never invents a type', () => {
    const c = normalizeCredential(credRaw({ credentialType: undefined }));
    expect(c).toMatchObject({ id: ID, subject: ADDR, issuer: ISSUER, type: 'unknown', status: 'ACTIVE' });
    expect(() => normalizeCredential(credRaw({ credentialId: '0x1' }))).toThrow(CredentiaError);
  });
});

describe('HTTP behaviour', () => {
  it.each([[400, 'VALIDATION'], [401, 'UNAUTHORIZED'], [403, 'UNAUTHORIZED'], [404, 'NOT_FOUND'], [429, 'RATE_LIMITED'], [500, 'SERVER'], [503, 'SERVER'], [418, 'BAD_RESPONSE']])(
    'HTTP %i -> %s', async (status, code) => {
      await expect(sdkWith(fakeFetch(status, { error: { message: `stack trace ${API_KEY}` } })).checkTrustScore(ADDR)).rejects.toMatchObject({ code, status });
    }
  );
  it('error text is fixed: never server output, URLs or the API key', async () => {
    const e = await sdkWith(fakeFetch(500, { error: { message: `boom ${API_KEY} https://internal.example` } })).checkTrustScore(ADDR).catch((x) => x);
    expect(JSON.stringify([e.message, e.code])).not.toMatch(/boom|internal|super-secret/);
    expect(errorForStatus(500).message).not.toContain('http');
  });
  it('maps a hung request to TIMEOUT', async () => {
    const hang: FetchLike = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(sdkWith(hang).checkTrustScore(ADDR)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('maps connection failure to NETWORK and caller abort to CANCELLED', async () => {
    await expect(sdkWith(jest.fn<FetchLike>().mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1'))).checkTrustScore(ADDR)).rejects.toMatchObject({ code: 'NETWORK', message: 'The Credentia API could not be reached.' });
    const c = new AbortController();
    const hang: FetchLike = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('x'))));
    const p = sdkWith(hang, { requestTimeoutMs: 5000 }).checkTrustScore(ADDR, { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('maps non-JSON bodies to BAD_RESPONSE', async () => {
    const f: FetchLike = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
    await expect(sdkWith(f).checkTrustScore(ADDR)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
  it('sends the key only as x-api-key, to the configured base, and validates config', async () => {
    const f = fakeFetch(200, trustRaw());
    await sdkWith(f, { apiUrl: 'https://api.example.test/base/' }).checkTrustScore(ADDR);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://api.example.test/base/api/v1/trust-score/${ADDR}`);
    expect(init.headers['x-api-key']).toBe(API_KEY);
    expect(url).not.toContain(API_KEY);
    expect(() => new HttpClient({ apiUrl: 'not a url' })).toThrow(CredentiaError);
    expect(() => new HttpClient({ apiUrl: 'ftp://x.y' })).toThrow(CredentiaError);
    expect(() => new HttpClient({ apiUrl: 'https://x.y', requestTimeoutMs: 0 })).toThrow(CredentiaError);
  });
  it('omits the key header when none is configured', async () => {
    const f = fakeFetch(200, trustRaw());
    await new CredentiaSDK({ apiUrl: 'https://api.example.test' }, f).checkTrustScore(ADDR);
    expect(f.mock.calls[0][1].headers).not.toHaveProperty('x-api-key');
  });
});

describe('CredentiaSDK reads', () => {
  it('checkTrustScore', async () => {
    expect(await sdkWith(fakeFetch(200, trustRaw())).checkTrustScore(ADDR)).toMatchObject({ score: 72, category: 'STRONGER', source: 'live' });
  });
  it('rejects bad input before any request', async () => {
    const f = fakeFetch(200, {});
    const sdk = sdkWith(f);
    await expect(sdk.checkTrustScore('0x123')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sdk.verifyCredential('0x12')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sdk.getAgentCredentials('nope')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(f).not.toHaveBeenCalled();
  });
  it('verifyCredential: active, revoked, and NOT_FOUND as a normal answer', async () => {
    expect(await sdkWith(fakeFetch(200, credRaw())).verifyCredential(ID)).toMatchObject({ id: ID, status: 'ACTIVE', type: 'KYC Passed' });
    expect((await sdkWith(fakeFetch(200, credRaw({ isRevoked: true }))).verifyCredential(ID)).status).toBe('REVOKED');
    expect(await sdkWith(fakeFetch(404, {})).verifyCredential(ID)).toEqual({ id: ID, subject: '', issuer: '', type: 'unknown', status: 'NOT_FOUND' });
    await expect(sdkWith(fakeFetch(500, {})).verifyCredential(ID)).rejects.toMatchObject({ code: 'SERVER' });
  });
  it('getAgentCredentials', async () => {
    const list = await sdkWith(fakeFetch(200, { credentials: [credRaw(), credRaw({ credentialId: `0x${'cd'.repeat(32)}`, expiresAt: 5 })], trustScore: 72 })).getAgentCredentials(ADDR);
    expect(list.map((c) => c.status)).toEqual(['ACTIVE', 'EXPIRED']);
    expect(await sdkWith(fakeFetch(200, { credentials: [] })).getAgentCredentials(ADDR)).toEqual([]);
    await expect(sdkWith(fakeFetch(200, { credentials: 'x' })).getAgentCredentials(ADDR)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});

describe('mintCredential (prepare only)', () => {
  const params = { subject: ADDR, credentialType: 'KYC Passed', expiresAt: FUTURE, metadataUri: 'https://example.com/m.json' };
  const never = jest.fn<FetchLike>();

  it('returns UNAVAILABLE, with a clear message, when chain or registry is not configured', async () => {
    for (const cfg of [{}, { chainId: 10143 }, { registryAddress: REGISTRY }]) {
      const r = await sdkWith(never, cfg).mintCredential(params);
      expect(r.status).toBe('UNAVAILABLE');
      expect(r.message).toMatch(/configure both chainId and registryAddress/);
      expect(r.preparedTransaction).toBeUndefined();
      expect(r.transactionHash).toBeUndefined();
      expect(r.credentialId).toBeUndefined();
    }
  });

  it('prepares an unsigned transaction whose calldata decodes to the requested issuance', async () => {
    const r = await sdkWith(never, { chainId: 10143, registryAddress: REGISTRY }).mintCredential(params);
    expect(r.status).toBe('PREPARED');
    expect(r.preparedTransaction).toMatchObject({ to: REGISTRY, value: '0', chainId: 10143 });
    expect(r.message).toMatch(/NOT been signed or sent/);
    expect(r.transactionHash).toBeUndefined();
    expect(r.credentialId).toBeUndefined();
    const { functionName, args } = decodeFunctionData({ abi: REGISTRY_ABI, data: r.preparedTransaction!.data as `0x${string}` });
    expect(functionName).toBe('issueCredential');
    expect(args).toEqual([ADDR, keccak256(toBytes('KYC Passed')), keccak256(toBytes('https://example.com/m.json')), BigInt(FUTURE)]);
    expect(never).not.toHaveBeenCalled(); // preparing never touches the network
  });

  it('uses a zero data hash without metadata, and passes a bytes32 type through', async () => {
    const t32 = `0x${'12'.repeat(32)}`;
    const r = await sdkWith(never, { chainId: 10143, registryAddress: REGISTRY }).mintCredential({ subject: ADDR, credentialType: t32, expiresAt: 0 });
    const { args } = decodeFunctionData({ abi: REGISTRY_ABI, data: r.preparedTransaction!.data as `0x${string}` });
    expect(args).toEqual([ADDR, t32, zeroHash, 0n]);
    expect(credentialTypeToBytes32('Custom')).toBe(keccak256(toBytes('Custom')));
  });

  it.each([
    [{ subject: 'nope' }], [{ credentialType: '  ' }], [{ expiresAt: 5 }], [{ expiresAt: -1 }], [{ metadataUri: 'http://insecure' }],
  ])('rejects invalid params %j', async (patch) => {
    await expect(sdkWith(never, { chainId: 10143, registryAddress: REGISTRY }).mintCredential({ ...params, ...patch })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects an invalid registry address or chain id', async () => {
    await expect(sdkWith(never, { chainId: 10143, registryAddress: 'bad' }).mintCredential(params)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sdkWith(never, { chainId: -5, registryAddress: REGISTRY }).mintCredential(params)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('safety properties of the source', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const SDK_SOURCES = ['types', 'api', 'utils', 'CredentiaSDK.ts', 'index.ts'].flatMap((p) => {
    const full = path.join(__dirname, '../src', p);
    return p.endsWith('.ts') ? [full] : files(full);
  });

  it('never touches private keys, signing, or broadcasting', () => {
    for (const f of SDK_SOURCES) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // ignore comments
      expect(code).not.toMatch(/privateKey|mnemonic|signMessage|signTransaction|signTypedData|sendTransaction|sendRawTransaction|writeContract|privateKeyToAccount/);
    }
  });

  it('never logs', () => {
    for (const f of SDK_SOURCES) expect(readFileSync(f, 'utf8')).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });
});
