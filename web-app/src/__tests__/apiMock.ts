import { jsonResponse } from './testUtils';

export const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const ISSUER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
export const CRED_ID = `0x${'ab'.repeat(32)}`;
const FUTURE = Math.floor(Date.now() / 1000) + 86_400 * 200;
const PAST = Math.floor(Date.now() / 1000) - 86_400 * 5;

export const trustRaw = (patch: Record<string, unknown> = {}) => ({
  address: ADDR, score: 72, scoreBps: 7200, lastUpdated: 1_790_000_000,
  breakdown: {
    credentials: { points: 80, weightBps: 4000 }, attestations: { points: 65, weightBps: 3500 }, staking: { points: 62, weightBps: 2500 },
  },
  ...patch,
});
export const credRaw = (patch: Record<string, unknown> = {}) => ({
  credentialId: CRED_ID, valid: true, isRevoked: false, issuer: ISSUER, subject: ADDR, credentialTypeHash: `0x${'cd'.repeat(32)}`,
  credentialType: 'KYC Passed', issuedAt: 1_780_000_000, expiresAt: FUTURE, dataHash: `0x${'ef'.repeat(32)}`, metadataUri: 'https://example.com/meta.json',
  ...patch,
});
export const expired = { expiresAt: PAST };

type Routes = Record<string, { status: number; body: unknown }>;
/** Installs a fetch that answers by URL prefix. Anything unmatched fails loudly, so no test can hit a real network. */
export function mockRoutes(routes: Routes) {
  const fn = jest.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix));
    if (!hit) throw new Error(`unexpected request in test: ${url}`);
    return jsonResponse(hit[1].status, hit[1].body);
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
