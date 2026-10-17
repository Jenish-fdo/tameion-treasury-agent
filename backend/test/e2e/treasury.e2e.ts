/**
 * End-to-end tests for businesses, mandates, validation and the decision log, against a local Anvil chain with the
 * contracts deployed. ARC TESTNET BEHAVIOUR IS NOT EXERCISED: standard Anvil does not reproduce Arc. Skipped when the
 * chain is not available:
 *
 *   anvil --chain-id 5042002 &       # (needs ~/.foundry/bin on PATH)
 *   ./scripts/deploy-local.sh        # writes backend/.env.local (Anvil's public test keys)
 *   npm run test:e2e
 *
 * The agent never holds a key here: its `consume` transactions are sent by impersonating its address on Anvil.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { createPublicClient, createTestClient, createWalletClient, defineChain, getAddress, http, keccak256, toBytes, zeroAddress, zeroHash } from 'viem';

const envFile = path.resolve(import.meta.dirname, '../../.env.local');
const rpcUrl = process.env.ARC_RPC_URL?.includes('127.0.0.1') ? process.env.ARC_RPC_URL : 'http://127.0.0.1:8545';

async function chainAvailable(): Promise<boolean> {
  if (!existsSync(envFile)) return false;
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const KEY = 'test-treasury-key-0123456789abcdef';
let OWNER = ''; // the demo business owner deploy-local.sh generated (DEMO_OWNER_ADDRESS in backend/.env.local)
const STRANGER_OWNER = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // Anvil account 6: the API holds no key for it
const AGENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // Anvil account 7: the agent, impersonated
const VENDOR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // Anvil account 8
const OTHER_VENDOR = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720'; // Anvil account 9
const USDC = 1_000_000n;
const u = (n: number | bigint) => (BigInt(n) * USDC).toString();

const chainUp = await chainAvailable();

describe('Treasury API (e2e)', { skip: chainUp ? false : 'local chain not available (see header of this file)' }, () => {
  let api: Server;
  let base: string;
  let businessId: string;
  let strangerBusinessId: string;
  const agentId = keccak256(toBytes('e2e-agent-1'));
  const expiresAt = () => Math.floor(Date.now() / 1000) + 30 * 86400;

  const call = async (method: string, url: string, opts: { key?: string | null; body?: unknown } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.key !== null) headers['x-api-key'] = opts.key ?? KEY;
    const res = await fetch(base + url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    return { status: res.status, body: (await res.json()) as any };
  };

  const mandateBody = (over: Record<string, unknown> = {}) => ({
    businessId,
    agent: AGENT,
    agentId: 'e2e-agent-1',
    categories: ['VENDOR_INVOICE', 'PAYROLL'],
    perTxLimit: u(1000),
    dailyCap: u(2000),
    weeklyCap: u(5000),
    monthlyCap: u(10000),
    approvalThreshold: u(500),
    maxRiskTier: 1,
    singleUse: false,
    expiresAt: expiresAt(),
    recipients: [VENDOR],
    ...over,
  });
  const payment = (over: Record<string, unknown> = {}) => ({
    agent: AGENT, recipient: VENDOR, amount: u(100), category: 'VENDOR_INVOICE', riskTier: 0, paymentId: `pay-${Math.random()}`, ...over,
  });
  const decisionBody = (over: Record<string, unknown> = {}) => ({
    businessId,
    agentId: 'e2e-agent-1',
    action: 'PAYMENT',
    counterparty: VENDOR,
    amount: u(100),
    rulesEvaluated: '255',
    rulesFailed: '0',
    riskTier: 0,
    riskScore: 1200,
    outcome: 'PROPOSED',
    rationaleHash: keccak256(toBytes('invoice matches PO 7')),
    ...over,
  });

  before(async () => {
    dotenv.config({ path: envFile });
    OWNER = getAddress(process.env.DEMO_OWNER_ADDRESS!);
    Object.assign(process.env, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ARC_RPC_URL: rpcUrl,
      ARC_CHAIN_ID: '5042002',
      API_KEYS: KEY,
      PRO_API_KEYS: '',
      RATE_LIMIT_FREE_PER_MIN: '1000',
      DATA_DIR: mkdtempSync(path.join(tmpdir(), 'credentia-treasury-test-')),
    });
    const { createApp } = await import('../../src/app.js');
    api = createApp().listen(0, '127.0.0.1');
    await new Promise((r) => api.once('listening', r));
    base = `http://127.0.0.1:${(api.address() as AddressInfo).port}/api/v1`;

    // A second business whose owner the API does NOT hold a key for and has not authorised its relayer on, created by impersonation.
    const chain = defineChain({ id: 5042002, name: 'Local', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
    const test = createTestClient({ chain, mode: 'anvil', transport: http(rpcUrl) });
    await test.impersonateAccount({ address: STRANGER_OWNER });
    await test.setBalance({ address: STRANGER_OWNER, value: 10n ** 20n });
    const wallet = createWalletClient({ account: STRANGER_OWNER, chain, transport: http(rpcUrl) });
    const pub = createPublicClient({ chain, transport: http(rpcUrl) });
    const { mandateRegistryAbi } = await import('../../src/chain/abis/mandateRegistry.js');
    const registry = getAddress(process.env.MANDATE_REGISTRY_ADDRESS!);
    const sim = await pub.simulateContract({ account: STRANGER_OWNER, address: registry, abi: mandateRegistryAbi, functionName: 'registerBusiness', args: [keccak256(toBytes(`stranger-${Date.now()}`)), zeroHash] });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(sim.request) });
    strangerBusinessId = sim.result;
  });

  after(() => {
    api?.close();
  });

  const consumeAsAgent = async (mandateId: string, p: { recipient: string; amount: bigint; category: number; riskTier: number; paymentId: string }) => {
    const chain = defineChain({ id: 5042002, name: 'Local', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
    const test = createTestClient({ chain, mode: 'anvil', transport: http(rpcUrl) });
    await test.impersonateAccount({ address: AGENT });
    await test.setBalance({ address: AGENT, value: 10n ** 20n });
    const wallet = createWalletClient({ account: AGENT, chain, transport: http(rpcUrl) });
    const pub = createPublicClient({ chain, transport: http(rpcUrl) });
    const { mandateRegistryAbi } = await import('../../src/chain/abis/mandateRegistry.js');
    const sim = await pub.simulateContract({
      account: AGENT,
      address: getAddress(process.env.MANDATE_REGISTRY_ADDRESS!),
      abi: mandateRegistryAbi,
      functionName: 'consume',
      args: [mandateId as `0x${string}`, { recipient: getAddress(p.recipient), amount: p.amount, category: p.category, riskTier: p.riskTier, paymentId: keccak256(toBytes(p.paymentId)) }, { approver: zeroAddress, deadline: 0n, signature: '0x' }],
    });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(sim.request) });
  };

  describe('authentication', () => {
    it('rejects requests without an API key', async () => {
      assert.equal((await call('GET', '/businesses/owners', { key: null })).status, 401);
      assert.equal((await call('POST', '/mandates', { key: null, body: {} })).status, 401);
      assert.equal((await call('POST', '/decisions', { key: null, body: {} })).status, 401);
    });
  });

  describe('businesses', () => {
    it('lists the managed demo owners without any key material', async () => {
      const { status, body } = await call('GET', '/businesses/owners');
      assert.equal(status, 200);
      assert.deepEqual(body.owners.map(getAddress), [getAddress(OWNER)]);
      assert.ok(!JSON.stringify(body).match(/0x[0-9a-f]{64}/i), 'no 32-byte secret in the response');
    });

    it('registers a business and authorises the relayer as a recorder', async () => {
      const { status, body } = await call('POST', '/businesses', { body: { owner: OWNER, salt: `e2e-${Date.now()}` } });
      assert.equal(status, 201, JSON.stringify(body));
      assert.match(body.businessId, /^0x[0-9a-f]{64}$/);
      assert.equal(body.relayerAuthorized, true);
      businessId = body.businessId;

      const got = await call('GET', `/businesses/${businessId}`);
      assert.equal(got.status, 200);
      assert.equal(getAddress(got.body.owner), getAddress(OWNER));
      assert.equal(got.body.relayerIsRecorder, true);
      assert.equal(got.body.ownerIsManaged, true);
    });

    it('refuses an owner the API holds no key for, and unknown businesses', async () => {
      const refused = await call('POST', '/businesses', { body: { owner: STRANGER_OWNER } });
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error.code, 'OWNER_NOT_MANAGED');
      assert.equal((await call('GET', `/businesses/0x${'ab'.repeat(32)}`)).status, 404);
      assert.equal((await call('POST', '/businesses', { body: { owner: 'nope' } })).status, 400);
    });
  });

  describe('mandates: create, list, get', () => {
    let mandateId: string;

    it('creates a mandate for an agent', async () => {
      const { status, body } = await call('POST', '/mandates', { body: mandateBody() });
      assert.equal(status, 201, JSON.stringify(body));
      mandateId = body.mandateId;
      assert.equal(body.status, 'ACTIVE');
      assert.equal(body.effectiveStatus, 'ACTIVE');
      assert.equal(getAddress(body.agent), getAddress(AGENT));
      assert.equal(body.agentId, agentId);
      assert.deepEqual(body.categories.sort(), ['PAYROLL', 'VENDOR_INVOICE']);
      assert.equal(body.perTxLimit, u(1000));
      assert.equal(body.approvalThreshold, u(500));
      assert.equal(body.singleUse, false);
      assert.deepEqual(body.recipients.map(getAddress), [getAddress(VENDOR)]);
      assert.deepEqual(body.spend, { day: '0', week: '0', month: '0' });
    });

    it('rejects bad input before the chain, and bad mandates on the chain', async () => {
      const cases: [string, Record<string, unknown>, number, string][] = [
        ['limits out of order', { perTxLimit: u(3000) }, 400, 'VALIDATION_ERROR'],
        ['unknown field', { privateKey: '0x1' }, 400, 'VALIDATION_ERROR'],
        ['unknown category', { categories: ['GAMBLING'] }, 400, 'VALIDATION_ERROR'],
        ['float amount', { perTxLimit: '12.5' }, 400, 'VALIDATION_ERROR'],
        ['risk tier above 2', { maxRiskTier: 3 }, 400, 'VALIDATION_ERROR'],
        ['already expired', { expiresAt: Math.floor(Date.now() / 1000) - 10 }, 400, 'INVALID_EXPIRY'],
        ['more than a year out', { expiresAt: Math.floor(Date.now() / 1000) + 400 * 86400 }, 400, 'INVALID_EXPIRY'],
        ['the agent is the owner', { agent: OWNER }, 400, 'AGENT_IS_OWNER'],
        ['the agent is a recipient', { recipients: [AGENT] }, 400, 'INVALID_RECIPIENT'],
        ['unknown business', { businessId: `0x${'cd'.repeat(32)}` }, 404, 'BUSINESS_NOT_FOUND'],
      ];
      for (const [label, over, status, code] of cases) {
        const r = await call('POST', '/mandates', { body: mandateBody(over) });
        assert.equal(r.status, status, `${label}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, code, label);
      }
    });

    it('refuses to act for a business whose owner the API holds no key for', async () => {
      const r = await call('POST', '/mandates', { body: mandateBody({ businessId: strangerBusinessId }) });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'OWNER_NOT_MANAGED');
    });

    it('lists by business and by agent, and gets one by id', async () => {
      const byBiz = await call('GET', `/mandates?businessId=${businessId}`);
      assert.equal(byBiz.status, 200);
      assert.ok(byBiz.body.total >= 1);
      assert.ok(byBiz.body.items.some((m: any) => m.mandateId === mandateId));

      const byAgent = await call('GET', `/mandates?agent=${AGENT}&limit=50`);
      assert.equal(byAgent.status, 200);
      assert.ok(byAgent.body.items.some((m: any) => m.mandateId === mandateId));
      assert.equal(byAgent.body.total, null, 'no per-agent count is exposed');

      assert.equal((await call('GET', `/mandates/${mandateId}`)).body.mandateId, mandateId);
      assert.equal((await call('GET', `/mandates/0x${'ee'.repeat(32)}`)).status, 404);
      assert.equal((await call('GET', '/mandates')).status, 400, 'a filter is required');
      assert.equal((await call('GET', `/mandates?businessId=${businessId}&agent=${AGENT}`)).status, 400, 'exactly one filter');
      assert.equal((await call('GET', `/mandates?businessId=${businessId}&limit=500`)).status, 400);
    });

    it('validates a payment, read-only, and reports the reason and the remaining caps', async () => {
      const ok = await call('POST', `/mandates/${mandateId}/validate`, { body: payment() });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.allowed, true);
      assert.equal(ok.body.needsApproval, false);
      assert.equal(ok.body.reason, 'NONE');
      assert.deepEqual(ok.body.remaining, { daily: u(2000), weekly: u(5000), monthly: u(10000) });

      const big = await call('POST', `/mandates/${mandateId}/validate`, { body: payment({ amount: u(600) }) });
      assert.equal(big.body.allowed, true);
      assert.equal(big.body.needsApproval, true, 'at or above the threshold a human must approve');

      const refusals: [string, Record<string, unknown>, string][] = [
        ['over the per-transaction limit', { amount: u(1001) }, 'OVER_PER_TX_LIMIT'],
        ['recipient not on the allowlist', { recipient: OTHER_VENDOR }, 'RECIPIENT_NOT_ALLOWED'],
        ['category not allowed', { category: 'TAX' }, 'CATEGORY_NOT_ALLOWED'],
        ['risk tier above the mandate', { riskTier: 2 }, 'RISK_TIER_TOO_HIGH'],
        ['wrong agent', { agent: OTHER_VENDOR }, 'WRONG_AGENT'],
        ['zero amount', { amount: '0' }, 'ZERO_AMOUNT'],
      ];
      for (const [label, over, reason] of refusals) {
        const r = await call('POST', `/mandates/${mandateId}/validate`, { body: payment(over) });
        assert.equal(r.status, 200, label);
        assert.equal(r.body.allowed, false, label);
        assert.equal(r.body.reason, reason, label);
      }
      const unknown = await call('POST', `/mandates/0x${'ff'.repeat(32)}/validate`, { body: payment() });
      assert.equal(unknown.body.reason, 'UNKNOWN_MANDATE');
      assert.equal((await call('POST', `/mandates/${mandateId}/validate`, { body: { ...payment(), extra: 1 } })).status, 400);
    });

    it('reflects spend made through the contract: remaining caps shrink and the daily cap bites', async () => {
      await consumeAsAgent(mandateId, { recipient: VENDOR, amount: 400n * USDC, category: 1, riskTier: 0, paymentId: 'e2e-spend-1' });
      const got = await call('GET', `/mandates/${mandateId}`);
      assert.deepEqual(got.body.spend, { day: u(400), week: u(400), month: u(400) });

      const v = await call('POST', `/mandates/${mandateId}/validate`, { body: payment({ amount: u(100) }) });
      assert.deepEqual(v.body.remaining, { daily: u(1600), weekly: u(4600), monthly: u(9600) });

      await consumeAsAgent(mandateId, { recipient: VENDOR, amount: 400n * USDC, category: 1, riskTier: 0, paymentId: 'e2e-spend-2' });
      await consumeAsAgent(mandateId, { recipient: VENDOR, amount: 400n * USDC, category: 1, riskTier: 0, paymentId: 'e2e-spend-3' });
      await consumeAsAgent(mandateId, { recipient: VENDOR, amount: 400n * USDC, category: 1, riskTier: 0, paymentId: 'e2e-spend-4' });
      const over = await call('POST', `/mandates/${mandateId}/validate`, { body: payment({ amount: u(500) }) });
      assert.equal(over.body.allowed, false);
      assert.equal(over.body.reason, 'OVER_DAILY_CAP');
    });

    it('revokes a mandate immediately, and a revoked mandate validates as REVOKED', async () => {
      const r = await call('POST', `/mandates/${mandateId}/revoke`, { body: { reason: 'vendor changed bank details' } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, 'REVOKED');
      assert.equal(r.body.effectiveStatus, 'REVOKED');

      const v = await call('POST', `/mandates/${mandateId}/validate`, { body: payment() });
      assert.equal(v.body.allowed, false);
      assert.equal(v.body.reason, 'REVOKED');

      const again = await call('POST', `/mandates/${mandateId}/revoke`, { body: {} });
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, 'MANDATE_NOT_ACTIVE');
      assert.equal((await call('POST', `/mandates/0x${'ee'.repeat(32)}/revoke`, { body: {} })).status, 404);
      assert.equal((await call('POST', `/mandates/${mandateId}/revoke`, { body: { reason: 'x', extra: true } })).status, 400);
    });
  });

  describe('decisions', () => {
    let mandateId: string;
    let proposedId: string;
    let escalatedId: string;

    before(async () => {
      const m = await call('POST', '/mandates', { body: mandateBody() });
      assert.equal(m.status, 201);
      mandateId = m.body.mandateId;
    });

    it('records a decision through the relayer and returns it with a verified hash', async () => {
      const { status, body } = await call('POST', '/decisions', { body: decisionBody({ mandateId, clientRef: 'offchain-1' }) });
      assert.equal(status, 201, JSON.stringify(body));
      proposedId = body.decisionId;
      assert.equal(body.decision.hashVerified, true);
      assert.equal(body.decision.action, 'PAYMENT');
      assert.equal(body.decision.outcome, 'PROPOSED');
      assert.equal(body.decision.amount, u(100));
      assert.equal(body.decision.seq, 0);
      assert.equal(body.decision.prevHash, null);
      assert.equal(body.decision.txHash, null);
      assert.equal(body.decision.mandateId, mandateId);

      const got = await call('GET', `/decisions/${proposedId}`);
      assert.equal(got.status, 200);
      assert.equal(got.body.recordHash, body.decision.recordHash);
      assert.equal(got.body.hashVerified, true);
    });

    it('chains each record to the previous one', async () => {
      const second = await call('POST', '/decisions', { body: decisionBody({ mandateId, outcome: 'EXECUTED', txHash: keccak256(toBytes('tx-1')), parentDecisionId: proposedId }) });
      assert.equal(second.status, 201, JSON.stringify(second.body));
      const first = await call('GET', `/decisions/${proposedId}`);
      assert.equal(second.body.decision.seq, 1);
      assert.equal(second.body.decision.prevHash, first.body.recordHash);
      assert.equal(second.body.decision.parentDecisionId, proposedId);
      assert.match(second.body.decision.txHash, /^0x[0-9a-f]{64}$/);
    });

    it('rejects invalid records with a named reason', async () => {
      const cases: [string, Record<string, unknown>, number, string][] = [
        ['executed without a tx hash', { outcome: 'EXECUTED' }, 400, 'EXECUTED_NEEDS_TX_HASH'],
        ['tx hash on a proposal', { txHash: keccak256(toBytes('x')) }, 400, 'TX_HASH_ONLY_WHEN_EXECUTED'],
        ['escalation without an approval reference', { action: 'ESCALATION', outcome: 'ESCALATED' }, 400, 'ESCALATION_NEEDS_APPROVAL_REF'],
        ['action and outcome disagree', { action: 'REJECTION', outcome: 'PROPOSED' }, 400, 'INVALID_ACTION_OUTCOME'],
        ['unknown parent', { parentDecisionId: `0x${'12'.repeat(32)}` }, 400, 'UNKNOWN_PARENT'],
        ['agent id does not match the mandate', { agentId: 'someone-else' }, 400, 'AGENT_MISMATCH'],
        ['mandate of another business', { businessId: strangerBusinessId }, 400, 'MANDATE_BUSINESS_MISMATCH'],
        ['risk score too high', { riskScore: 10001 }, 400, 'VALIDATION_ERROR'],
        ['plain-text rationale is not accepted', { rationaleHash: 'my private reasoning' }, 400, 'VALIDATION_ERROR'],
        ['unknown field', { rationale: 'my private reasoning' }, 400, 'VALIDATION_ERROR'],
      ];
      for (const [label, over, status, code] of cases) {
        const r = await call('POST', '/decisions', { body: decisionBody({ mandateId, ...over }) });
        assert.equal(r.status, status, `${label}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, code, label);
      }
    });

    it('refuses to write for a business that has not authorised the relayer', async () => {
      const r = await call('POST', '/decisions', { body: decisionBody({ businessId: strangerBusinessId, agentId: 'anyone', action: 'REJECTION', outcome: 'REJECTED' }) });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'NOT_AUTHORIZED');
    });

    it('makes a retry idempotent with clientRef', async () => {
      const r = await call('POST', '/decisions', { body: decisionBody({ mandateId, clientRef: 'offchain-1' }) });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'DUPLICATE_CLIENT_REF');
    });

    it('lists by business (linked), agent and mandate, with paging', async () => {
      const byBiz = await call('GET', `/decisions?businessId=${businessId}`);
      assert.equal(byBiz.status, 200);
      assert.ok(byBiz.body.total >= 2);
      assert.equal(byBiz.body.linked, true);
      assert.ok(byBiz.body.items.every((d: any) => d.hashVerified === true));

      const byAgent = await call('GET', `/decisions?agentId=e2e-agent-1`);
      assert.equal(byAgent.status, 200);
      assert.ok(byAgent.body.items.every((d: any) => d.agentId === agentId));
      assert.equal(byAgent.body.linked, null);

      const byMandate = await call('GET', `/decisions?mandateId=${mandateId}`);
      assert.equal(byMandate.body.total, 2);

      const paged = await call('GET', `/decisions?businessId=${businessId}&offset=1&limit=1`);
      assert.equal(paged.body.items.length, 1);
      assert.equal(paged.body.items[0].seq, 1);

      assert.equal((await call('GET', '/decisions')).status, 400);
      assert.equal((await call('GET', `/decisions?businessId=${businessId}&mandateId=${mandateId}`)).status, 400);
      assert.equal((await call('GET', `/decisions/0x${'77'.repeat(32)}`)).status, 404);
    });

    it('shows an escalation as pending until a follow-up record resolves it', async () => {
      const esc = await call('POST', '/decisions', {
        body: decisionBody({ mandateId, action: 'ESCALATION', outcome: 'ESCALATED', amount: u(800), approvalRef: 'approval-request-1', riskTier: 2, riskScore: 6200 }),
      });
      assert.equal(esc.status, 201, JSON.stringify(esc.body));
      escalatedId = esc.body.decisionId;

      let pending = await call('GET', `/approvals/pending?businessId=${businessId}`);
      assert.equal(pending.status, 200);
      assert.deepEqual(pending.body.items.map((d: any) => d.decisionId), [escalatedId]);

      const resolved = await call('POST', '/decisions', {
        body: decisionBody({ mandateId, amount: u(800), outcome: 'EXECUTED', txHash: keccak256(toBytes('tx-2')), approvalRef: 'approval-request-1', parentDecisionId: escalatedId }),
      });
      assert.equal(resolved.status, 201, JSON.stringify(resolved.body));

      pending = await call('GET', `/approvals/pending?businessId=${businessId}`);
      assert.deepEqual(pending.body.items, []);
      assert.equal((await call('GET', '/approvals/pending')).status, 400);
    });
  });
});
