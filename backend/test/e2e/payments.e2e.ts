/**
 * End-to-end tests for POST /mandates/:id/pay: validate, consume, send USDC, log the decision. Needs an Arc-faithful
 * local node, because it moves real (test) USDC through the USDC contract at 0x3600…0000, which `arc-anvil` provides and
 * standard Anvil does not:
 *
 *   arc-anvil --network arc --chain-id 5042002 &
 *   PATH=<shim with forge/cast -> arc-forge/arc-cast> ./scripts/deploy-local.sh   # writes backend/.env.local
 *   tsx --test test/e2e/payments.e2e.ts
 *
 * Skipped when the node is not there or has no USDC contract. The demo owner's key is the random local-test key
 * deploy-local.sh generated; the agent wallet is the relayer (Anvil's public test key #4).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { createPublicClient, getAddress, http, keccak256, parseAbi, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const envFile = path.resolve(import.meta.dirname, '../../.env.local');
const rpcUrl = process.env.ARC_RPC_URL?.includes('127.0.0.1') ? process.env.ARC_RPC_URL : 'http://127.0.0.1:8545';
const USDC_CONTRACT = '0x3600000000000000000000000000000000000000';

async function arcNodeAvailable(): Promise<boolean> {
  if (!existsSync(envFile)) return false;
  try {
    const rpc = async (method: string, params: unknown[]) =>
      (await (await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(2000) })).json()) as any;
    const code = await rpc('eth_getCode', [USDC_CONTRACT, 'latest']);
    return typeof code.result === 'string' && code.result.length > 4;
  } catch {
    return false;
  }
}

const KEY = 'test-treasury-key-0123456789abcdef';
const UNMANAGED_AGENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // Anvil account 7: the API holds no key for it
const VENDOR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const OTHER = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';
const USDC = 1_000_000n;
const u = (n: number | bigint) => (BigInt(n) * USDC).toString();

const up = await arcNodeAvailable();

describe('Agent payments (e2e, Arc local node)', { skip: up ? false : 'arc-anvil with the USDC contract is not available (see header)' }, () => {
  let api: Server;
  let base: string;
  let owner: `0x${string}`;
  let ownerKey: `0x${string}`;
  let registry: `0x${string}`;
  let agent: `0x${string}`;
  let businessId: string;
  let mandateId: string;
  const pub = createPublicClient({ transport: http(rpcUrl) });
  const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
  const balanceOf = (a: string) => pub.readContract({ address: USDC_CONTRACT, abi: erc20, functionName: 'balanceOf', args: [a as `0x${string}`] });

  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-api-key': KEY }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
  };
  const pay = (over: Record<string, unknown> = {}) =>
    call('POST', `/mandates/${mandateId}/pay`, {
      recipient: VENDOR, amount: u(100), category: 'VENDOR_INVOICE', riskTier: 0, riskScore: 800,
      paymentId: `pay-${Math.random()}`, rationale: 'Invoice 114 matches PO 7 and the vendor is on the allowlist', ...over,
    });

  before(async () => {
    dotenv.config({ path: envFile });
    owner = getAddress(process.env.DEMO_OWNER_ADDRESS!) as `0x${string}`;
    ownerKey = process.env.BUSINESS_OWNER_PRIVATE_KEYS!.split(',')[0].trim() as `0x${string}`;
    registry = getAddress(process.env.MANDATE_REGISTRY_ADDRESS!) as `0x${string}`;
    Object.assign(process.env, {
      NODE_ENV: 'test', LOG_LEVEL: 'error', ARC_RPC_URL: rpcUrl, ARC_CHAIN_ID: '5042002', API_KEYS: KEY, PRO_API_KEYS: '',
      RATE_LIMIT_FREE_PER_MIN: '1000', DATA_DIR: mkdtempSync(path.join(tmpdir(), 'credentia-pay-test-')),
    });
    const { createApp } = await import('../../src/app.js');
    api = createApp().listen(0, '127.0.0.1');
    await new Promise((r) => api.once('listening', r));
    base = `http://127.0.0.1:${(api.address() as AddressInfo).port}/api/v1`;

    const biz = await call('POST', '/businesses', { owner, salt: `pay-e2e-${Date.now()}` });
    assert.equal(biz.status, 201, JSON.stringify(biz.body));
    assert.equal(biz.body.relayerAuthorized, true);
    businessId = biz.body.businessId;
    agent = getAddress(biz.body.relayer) as `0x${string}`; // the relayer's key doubles as the demo agent wallet

    const m = await call('POST', '/mandates', {
      businessId, agent, agentId: 'treasury-agent-1', categories: ['VENDOR_INVOICE'], perTxLimit: u(1000), dailyCap: u(2000),
      weeklyCap: u(5000), monthlyCap: u(10000), approvalThreshold: u(500), maxRiskTier: 1, singleUse: false,
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400, recipients: [VENDOR],
    });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    mandateId = m.body.mandateId;
  });

  after(() => api?.close());

  it('pays an allowed invoice: USDC moves, the spend is counted, the decision carries the transfer hash', async () => {
    const before = await balanceOf(VENDOR);
    const r = await pay({ amount: u(100) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'executed');
    assert.equal((await balanceOf(VENDOR)) - before, 100n * USDC);
    assert.equal(r.body.decision.outcome, 'EXECUTED');
    assert.equal(r.body.decision.action, 'PAYMENT');
    assert.equal(r.body.decision.txHash, r.body.transferTxHash);
    assert.equal(r.body.decision.hashVerified, true);
    assert.equal(r.body.decision.counterparty, VENDOR);
    assert.equal(r.body.decision.rationaleHash, keccak256(toBytes('Invoice 114 matches PO 7 and the vendor is on the allowlist')));
    assert.equal(r.body.spend.day, u(100));
    assert.equal(r.body.rulesFailed, undefined);
  });

  it('rejects an over-limit payment, sends nothing and logs a REJECTION naming the failed rule', async () => {
    const before = await balanceOf(VENDOR);
    const r = await pay({ amount: u(2000) });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'rejected');
    assert.equal(r.body.reason, 'OVER_PER_TX_LIMIT');
    assert.equal(await balanceOf(VENDOR), before);
    assert.equal(r.body.decision.action, 'REJECTION');
    assert.equal(r.body.decision.outcome, 'REJECTED');
    assert.equal(r.body.decision.rulesFailed, String(1n << 5n)); // PER_TX_LIMIT
  });

  it('rejects a recipient that is not on the allowlist', async () => {
    const before = await balanceOf(OTHER);
    const r = await pay({ recipient: OTHER });
    assert.equal(r.body.status, 'rejected');
    assert.equal(r.body.reason, 'RECIPIENT_NOT_ALLOWED');
    assert.equal(await balanceOf(OTHER), before);
  });

  it('refuses to replay a payment id', async () => {
    const paymentId = `replay-${Math.random()}`;
    assert.equal((await pay({ paymentId })).body.status, 'executed');
    const again = await pay({ paymentId });
    assert.equal(again.body.status, 'rejected');
    assert.equal(again.body.reason, 'PAYMENT_ALREADY_USED');
  });

  it('escalates a payment at the approval threshold, then pays it once a human has signed', async () => {
    const paymentId = keccak256(toBytes(`big-${Math.random()}`));
    const before = await balanceOf(VENDOR);

    const held = await pay({ amount: u(800), paymentId });
    assert.equal(held.body.status, 'escalated');
    assert.equal(await balanceOf(VENDOR), before, 'nothing is sent while waiting for a human');
    assert.equal(held.body.decision.outcome, 'ESCALATED');

    let pending = await call('GET', `/approvals/pending?businessId=${businessId}`);
    assert.ok(pending.body.items.some((d: any) => d.decisionId === held.body.decisionId));

    // The business owner signs the PaymentApproval (EIP-712) for exactly this payment.
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const signature = await privateKeyToAccount(ownerKey).signTypedData({
      domain: { name: 'Credentia Mandates', version: '1', chainId: 5042002, verifyingContract: registry },
      primaryType: 'PaymentApproval',
      types: {
        PaymentApproval: [
          { name: 'mandateId', type: 'bytes32' }, { name: 'paymentId', type: 'bytes32' }, { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint128' }, { name: 'deadline', type: 'uint64' },
        ],
      },
      message: { mandateId: mandateId as `0x${string}`, paymentId, recipient: VENDOR, amount: 800n * USDC, deadline: BigInt(deadline) },
    });

    const done = await pay({ amount: u(800), paymentId, escalationId: held.body.decisionId, approval: { approver: owner, deadline, signature } });
    assert.equal(done.body.status, 'executed', JSON.stringify(done.body));
    assert.equal((await balanceOf(VENDOR)) - before, 800n * USDC);
    assert.equal(done.body.decision.parentDecisionId, held.body.decisionId);

    pending = await call('GET', `/approvals/pending?businessId=${businessId}`);
    assert.ok(!pending.body.items.some((d: any) => d.decisionId === held.body.decisionId), 'the escalation is resolved');
  });

  it('keeps the whole trail as one verified hash chain', async () => {
    const log = await call('GET', `/decisions?businessId=${businessId}&limit=50`);
    assert.equal(log.body.linked, true);
    assert.ok(log.body.items.length >= 6);
    assert.ok(log.body.items.every((d: any) => d.hashVerified));
  });

  it('refuses a mandate whose agent wallet the API does not hold', async () => {
    const m = await call('POST', '/mandates', {
      businessId, agent: UNMANAGED_AGENT, agentId: 'other-agent', categories: ['VENDOR_INVOICE'], perTxLimit: u(10), dailyCap: u(10),
      weeklyCap: u(10), monthlyCap: u(10), approvalThreshold: u(10), maxRiskTier: 0, expiresAt: Math.floor(Date.now() / 1000) + 86400, recipients: [VENDOR],
    });
    const r = await call('POST', `/mandates/${m.body.mandateId}/pay`, { recipient: VENDOR, amount: u(1), category: 'VENDOR_INVOICE', rationale: 'x' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'AGENT_NOT_MANAGED');
  });

  it('validates the request body', async () => {
    assert.equal((await call('POST', `/mandates/${mandateId}/pay`, { recipient: VENDOR, amount: '0', category: 'VENDOR_INVOICE', rationale: 'x' })).status, 400);
    assert.equal((await call('POST', `/mandates/${mandateId}/pay`, { recipient: VENDOR, amount: u(1), category: 'VENDOR_INVOICE' })).status, 400); // no rationale
    assert.equal((await call('POST', `/mandates/${mandateId}/pay`, { recipient: VENDOR, amount: u(1), category: 'VENDOR_INVOICE', rationale: 'x', extra: 1 })).status, 400);
  });
});
