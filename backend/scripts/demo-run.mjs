#!/usr/bin/env node
// Runs a small, real treasury session through the API and prints a summary with explorer links. It spends USDC from the
// agent wallet (the relayer key) to the demo vendors, so the chain it points at decides whether that is test or real money:
// use Arc TESTNET only. Needs the API running with MANDATE_REGISTRY_ADDRESS, DECISION_LOG_ADDRESS, BUSINESS_OWNER_PRIVATE_KEYS
// and BACKEND_WALLET_PRIVATE_KEY set, and the agent wallet funded (about 15 USDC covers it).
//
//   API_BASE=http://localhost:3001/api/v1 API_KEY=<one of API_KEYS> node scripts/demo-run.mjs
//   Optional: DEMO_VENDORS=0xAAA…,0xBBB…,0xCCC…  (public addresses; defaults to three fixed demo addresses)
const BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const KEY = process.env.API_KEY;
if (!KEY) { console.error('Set API_KEY to one of the API_KEYS the backend was started with.'); process.exit(1); }

const USDC = 1_000_000n;
const u = (n) => (BigInt(n) * USDC).toString();
const VENDORS = (process.env.DEMO_VENDORS ?? '0x1111111111111111111111111111111111110001,0x1111111111111111111111111111111111110002,0x1111111111111111111111111111111111110003')
  .split(',').map((s) => s.trim());
const STRANGER = '0x2222222222222222222222222222222222220009'; // never on the allowlist

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-api-key': KEY }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 200) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json.error ?? json)}`);
  return json;
}
const line = (s) => console.log(s);

const { owners } = await api('GET', '/businesses/owners');
if (!owners.length) throw new Error('The API holds no demo owner key (BUSINESS_OWNER_PRIVATE_KEYS).');
const biz = await api('POST', '/businesses', { owner: owners[0], salt: `demo-${Date.now()}` });
if (!biz.relayerAuthorized) throw new Error('The relayer was not authorised as a recorder; check BACKEND_WALLET_PRIVATE_KEY.');
line(`Business   ${biz.businessId}\nOwner      ${biz.owner}\nAgent      ${biz.relayer}  (agent wallet = relayer key)`);

const mandate = await api('POST', '/mandates', {
  businessId: biz.businessId, agent: biz.relayer, agentId: 'treasury-agent-1', categories: ['VENDOR_INVOICE', 'CONTRACTOR'],
  perTxLimit: u(5), dailyCap: u(20), weeklyCap: u(50), monthlyCap: u(100), approvalThreshold: u(3), maxRiskTier: 1,
  expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400, recipients: VENDORS,
});
line(`Mandate    ${mandate.mandateId}  (per-tx ${5} USDC, daily ${20}, approval from ${3} USDC)\n`);

const steps = [
  ['Pay vendor 1 (invoice matches PO)', { recipient: VENDORS[0], amount: u(1), category: 'VENDOR_INVOICE', riskScore: 700, rationale: 'Invoice INV-1041 matches PO 7, vendor on allowlist, amount within the daily cap.' }],
  ['Pay vendor 2 (contractor milestone)', { recipient: VENDORS[1], amount: u(2), category: 'CONTRACTOR', riskScore: 900, rationale: 'Milestone 2 accepted by the owner; contractor wallet unchanged since last payment.' }],
  ['Pay vendor 3 (invoice)', { recipient: VENDORS[2], amount: u(1), category: 'VENDOR_INVOICE', riskScore: 650, rationale: 'Monthly hosting invoice, same amount as the previous three months.' }],
  ['Over the per-transaction limit', { recipient: VENDORS[0], amount: u(10), category: 'VENDOR_INVOICE', riskScore: 3100, rationale: 'Invoice 10x larger than usual; the agent tries it to show the mandate refuses.' }],
  ['Recipient not on the allowlist', { recipient: STRANGER, amount: u(1), category: 'VENDOR_INVOICE', riskScore: 5200, rationale: 'New payee requested in an email; not an approved vendor.' }],
  ['Needs a human (4 USDC >= 3 USDC threshold)', { recipient: VENDORS[0], amount: u(4), category: 'VENDOR_INVOICE', riskScore: 2400, riskTier: 1, rationale: 'Larger than the approval threshold, so it waits for the owner instead of going out.' }],
];

const rows = [];
for (const [label, body] of steps) {
  const r = await api('POST', `/mandates/${mandate.mandateId}/pay`, body);
  rows.push({ label, status: r.status, reason: r.reason ?? '', amount: Number(BigInt(body.amount) / USDC), tx: r.explorerUrl ?? '', decision: r.decisionId });
  line(`${r.status.toUpperCase().padEnd(10)} ${label}${r.reason ? `  [${r.reason}]` : ''}${r.explorerUrl ? `\n           ${r.explorerUrl}` : ''}`);
}

const log = await api('GET', `/decisions?businessId=${biz.businessId}&limit=50`);
const pending = await api('GET', `/approvals/pending?businessId=${biz.businessId}`);
const sent = rows.filter((r) => r.status === 'executed').reduce((a, r) => a + r.amount, 0);
line(`\nDecisions logged: ${log.total} (hash chain linked: ${log.linked}; every hash verified: ${log.items.every((d) => d.hashVerified)})`);
line(`USDC sent: ${sent}   Payments executed: ${rows.filter((r) => r.status === 'executed').length}   Refused: ${rows.filter((r) => r.status === 'rejected').length}   Waiting for a human: ${pending.items.length}`);
line(`Business id for the web app: ${biz.businessId}`);
