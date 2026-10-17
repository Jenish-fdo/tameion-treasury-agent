/**
 * Treasury API without a chain: authentication, input validation and the "not configured" answers. The chain-backed
 * behaviour is covered by test/e2e/treasury.e2e.ts against a local Anvil node.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { keccak256, toBytes, zeroAddress, zeroHash } from 'viem';
import { CATEGORY_NAMES, categoriesFromMask, categoryMask, computeDecisionHash, type RawDecision } from '../../src/chain/treasury.js';
import {
  createDecisionSchema, createMandateSchema, listDecisionsQuerySchema, listMandatesQuerySchema, validatePaymentSchema,
} from '../../src/schemas/treasury.js';

const KEY = 'treasury-test-key-0123456789abcdef';
const BIZ = `0x${'ab'.repeat(32)}`;
const AGENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const VENDOR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const U = (n: number) => (BigInt(n) * 1_000_000n).toString();

let app: Express;
beforeAll(async () => {
  Object.assign(process.env, { API_KEYS: KEY, RATE_LIMIT_FREE_PER_MIN: '1000' });
  const { createApp } = await import('../../src/app.js');
  app = createApp();
});

const validMandate = (over: Record<string, unknown> = {}) => ({
  businessId: BIZ, agent: AGENT, agentId: 'agent-1', categories: ['VENDOR_INVOICE'],
  perTxLimit: U(100), dailyCap: U(200), weeklyCap: U(500), monthlyCap: U(1000), approvalThreshold: U(50),
  maxRiskTier: 1, expiresAt: 4_000_000_000, recipients: [VENDOR], ...over,
});

describe('categories', () => {
  it('round-trips through the bitmask and matches the contract bit positions', () => {
    expect(categoryMask(['PAYROLL'])).toBe(1);
    expect(categoryMask(['VENDOR_INVOICE'])).toBe(2);
    expect(categoryMask(['OTHER'])).toBe(256);
    expect(categoryMask([...CATEGORY_NAMES])).toBe(511);
    expect(categoriesFromMask(categoryMask(['TAX', 'RENT']))).toEqual(['TAX', 'RENT']);
    expect(categoriesFromMask(0)).toEqual([]);
  });
});

describe('create-mandate schema', () => {
  it('accepts a valid mandate, turns categories into a mask, and hashes a text agent id', () => {
    const m = createMandateSchema.parse(validMandate({ categories: ['PAYROLL', 'VENDOR_INVOICE', 'PAYROLL'] }));
    expect(m.allowedCategories).toBe(3);
    expect(m.agentId).toBe(keccak256(toBytes('agent-1')));
    expect(m.perTxLimit).toBe(100_000_000n);
    expect(m.singleUse).toBe(false);
    expect(m.recipients).toHaveLength(1);
  });

  it('keeps a bytes32 agent id as given', () => {
    expect(createMandateSchema.parse(validMandate({ agentId: BIZ.toUpperCase().replace('0X', '0x') })).agentId).toBe(BIZ);
  });

  it.each([
    ['limits out of order', { perTxLimit: U(300) }],
    ['daily above weekly', { dailyCap: U(600) }],
    ['zero per-tx limit', { perTxLimit: '0' }],
    ['a float amount', { dailyCap: '1.5' }],
    ['an amount above uint128', { monthlyCap: '340282366920938463463374607431768211456' }],
    ['no categories', { categories: [] }],
    ['an unknown category', { categories: ['GAMBLING'] }],
    ['risk tier 3', { maxRiskTier: 3 }],
    ['more than 100 recipients', { recipients: Array.from({ length: 101 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`) }],
    ['a bad recipient', { recipients: ['0x123'] }],
    ['an unknown field', { privateKey: '0x1' }],
    ['expiry beyond the cap', { expiresAt: 4_102_444_801 }],
  ])('rejects %s', (_label, over) => {
    expect(() => createMandateSchema.parse(validMandate(over))).toThrow();
  });
});

describe('validate-payment schema', () => {
  const ok = { agent: AGENT, recipient: VENDOR, amount: U(10), category: 'VENDOR_INVOICE', riskTier: 0, paymentId: 'p-1' };
  it('accepts a payment and hashes the payment id', () => {
    expect(validatePaymentSchema.parse(ok).paymentId).toBe(keccak256(toBytes('p-1')));
  });
  it('allows a zero amount through so the contract can answer ZERO_AMOUNT, but nothing else odd', () => {
    expect(validatePaymentSchema.parse({ ...ok, amount: '0' }).amount).toBe(0n);
    expect(() => validatePaymentSchema.parse({ ...ok, riskTier: 4 })).toThrow();
    expect(() => validatePaymentSchema.parse({ ...ok, category: 'NOPE' })).toThrow();
    expect(() => validatePaymentSchema.parse({ ...ok, amount: '-1' })).toThrow();
  });
});

describe('create-decision schema', () => {
  const ok = {
    businessId: BIZ, agentId: 'agent-1', action: 'PAYMENT', riskTier: 1, riskScore: 4000, outcome: 'PROPOSED',
    rationaleHash: keccak256(toBytes('why')),
  };
  it('applies zero defaults for the optional fields', () => {
    const d = createDecisionSchema.parse(ok);
    expect(d.counterparty).toBe(zeroAddress);
    expect(d.amount).toBe(0n);
    expect(d.rulesEvaluated).toBe(0n);
    expect(d.mandateId).toBeUndefined();
  });
  it('never accepts a plain-text rationale or an unknown field', () => {
    expect(() => createDecisionSchema.parse({ ...ok, rationaleHash: 'because I said so' })).toThrow();
    expect(() => createDecisionSchema.parse({ ...ok, rationale: 'because I said so' })).toThrow();
    expect(() => createDecisionSchema.parse({ ...ok, riskScore: 10_001 })).toThrow();
    expect(() => createDecisionSchema.parse({ ...ok, action: 'WIRE' })).toThrow();
  });
});

describe('list query schemas', () => {
  it('require exactly one filter and bound the page size', () => {
    expect(() => listMandatesQuerySchema.parse({})).toThrow();
    expect(() => listMandatesQuerySchema.parse({ businessId: BIZ, agent: AGENT })).toThrow();
    expect(listMandatesQuerySchema.parse({ businessId: BIZ })).toMatchObject({ offset: 0, limit: 20 });
    expect(() => listMandatesQuerySchema.parse({ businessId: BIZ, limit: '51' })).toThrow();
    expect(() => listDecisionsQuerySchema.parse({ businessId: BIZ, mandateId: BIZ })).toThrow();
    expect(listDecisionsQuerySchema.parse({ agentId: 'agent-1' }).agentId).toBe(keccak256(toBytes('agent-1')));
  });
});

describe('decision record hash', () => {
  const base: RawDecision = {
    decisionId: keccak256(toBytes('d')), seq: 3n, timestamp: 1_800_000_000n, recorder: AGENT as `0x${string}`,
    businessId: BIZ as `0x${string}`, agentId: keccak256(toBytes('a')), mandateId: zeroHash,
    action: 0, counterparty: VENDOR as `0x${string}`, amount: 250_000_000n, rulesEvaluated: 255n, rulesFailed: 0n,
    riskTier: 0, riskScore: 1200, outcome: 0, rationaleHash: keccak256(toBytes('r')), txHash: zeroHash, approvalRef: zeroHash,
    parentDecisionId: zeroHash, clientRef: zeroHash, prevHash: zeroHash, recordHash: zeroHash,
  };
  it('changes when any covered field changes, and ignores the stored recordHash itself', () => {
    const h = computeDecisionHash(base);
    expect(computeDecisionHash({ ...base, recordHash: h })).toBe(h);
    for (const change of [{ amount: 1n }, { counterparty: AGENT as `0x${string}` }, { outcome: 1 }, { seq: 4n }, { prevHash: BIZ as `0x${string}` }, { rationaleHash: zeroHash }, { riskScore: 1201 }]) {
      expect(computeDecisionHash({ ...base, ...change })).not.toBe(h);
    }
  });
});

describe('HTTP surface without a chain', () => {
  const get = (url: string, key: string | null = KEY) => {
    const r = request(app).get(`/api/v1${url}`);
    return key ? r.set('x-api-key', key) : r;
  };
  const post = (url: string, body: unknown, key: string | null = KEY) => {
    const r = request(app).post(`/api/v1${url}`);
    return (key ? r.set('x-api-key', key) : r).send(body as object);
  };

  it('requires an API key on every route', async () => {
    for (const [method, url] of [['GET', '/businesses/owners'], ['POST', '/businesses'], ['GET', '/mandates'], ['POST', '/mandates'], ['POST', '/decisions'], ['GET', '/decisions'], ['GET', '/approvals/pending']] as const) {
      const res = method === 'GET' ? await get(url, null) : await post(url, {}, null);
      expect(res.status).toBe(401);
    }
  });

  it('lists no managed owners when none are configured, and never returns key material', async () => {
    const res = await get('/businesses/owners');
    expect(res.status).toBe(200);
    expect(res.body.owners).toEqual([]);
  });

  it('answers 400 for bad input before it looks at the chain', async () => {
    expect((await post('/mandates', validMandate({ perTxLimit: U(999) }))).status).toBe(400);
    expect((await get('/mandates')).status).toBe(400);
    expect((await get('/decisions?businessId=nope')).status).toBe(400);
    expect((await post(`/mandates/${BIZ}/validate`, { agent: 'x' })).status).toBe(400);
    expect((await post('/decisions', { businessId: BIZ })).status).toBe(400);
    expect((await get('/mandates/not-an-id')).status).toBe(400);
  });

  it('answers 503 NOT_CONFIGURED when the contracts are not configured', async () => {
    const calls = [
      post('/mandates', validMandate()),
      post('/businesses', { owner: AGENT }),
      get(`/mandates/${BIZ}`),
      get(`/mandates?businessId=${BIZ}`),
      post(`/mandates/${BIZ}/validate`, { agent: AGENT, recipient: VENDOR, amount: U(1), category: 'TAX', riskTier: 0, paymentId: 'x' }),
      post('/decisions', { businessId: BIZ, agentId: 'a', action: 'REJECTION', outcome: 'REJECTED', riskTier: 0, riskScore: 0, rationaleHash: zeroHash }),
      get(`/decisions/${BIZ}`),
      get(`/approvals/pending?businessId=${BIZ}`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('NOT_CONFIGURED');
    }
  });
});
