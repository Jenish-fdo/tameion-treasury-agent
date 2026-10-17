import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DecisionsView } from '@/components/treasury/DecisionsView';
import { MandatesView, buildMandateBody } from '@/components/treasury/MandatesView';
import { ValidateView } from '@/components/treasury/ValidateView';
import type { DecisionView, MandateView } from '@/lib/treasury';
import { jsonResponse } from './testUtils';

const BIZ = `0x${'ab'.repeat(32)}`;
const MANDATE_ID = `0x${'cd'.repeat(32)}`;
const AGENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const VENDOR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const OWNER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const NOW = Math.floor(Date.now() / 1000);

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

type Handler = (body: any, url: string) => { status: number; body: unknown };
/** A fetch that answers by "METHOD path" (path without the /api/backend/ prefix and without the query). Unmatched calls fail loudly. */
function mockApi(routes: Record<string, Handler | { status: number; body: unknown }>) {
  const calls: { key: string; url: string; body: any }[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace('/api/backend/', '').split('?')[0];
    const key = `${init?.method ?? 'GET'} ${path}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, url, body });
    const r = routes[key];
    if (!r) throw new Error(`unexpected request in test: ${key}`);
    const out = typeof r === 'function' ? r(body, url) : r;
    return jsonResponse(out.status, out.body);
  }) as unknown as typeof fetch;
  return calls;
}

const mandate = (over: Partial<MandateView> = {}): MandateView => ({
  mandateId: MANDATE_ID, businessId: BIZ, owner: OWNER, agent: AGENT, agentId: `0x${'11'.repeat(32)}`,
  status: 'ACTIVE', effectiveStatus: 'ACTIVE', categories: ['VENDOR_INVOICE', 'PAYROLL'],
  perTxLimit: '1000000000', dailyCap: '2000000000', weeklyCap: '5000000000', monthlyCap: '10000000000', approvalThreshold: '500000000',
  maxRiskTier: 1, singleUse: false, expiresAt: NOW + 30 * 86400, createdAt: NOW, nonce: '1',
  spend: { day: '400000000', week: '400000000', month: '400000000' }, recipients: [VENDOR], ...over,
});

const decision = (over: Partial<DecisionView> = {}): DecisionView => ({
  decisionId: `0x${'01'.repeat(32)}`, seq: 0, timestamp: NOW, recorder: AGENT, businessId: BIZ, agentId: `0x${'11'.repeat(32)}`, mandateId: MANDATE_ID,
  action: 'PAYMENT', counterparty: VENDOR, amount: '250000000', riskTier: 0, riskScore: 1200, outcome: 'PROPOSED',
  rationaleHash: `0x${'22'.repeat(32)}`, txHash: null, approvalRef: null, parentDecisionId: null, recordHash: `0x${'33'.repeat(32)}`, hashVerified: true, ...over,
});

beforeEach(() => {
  window.localStorage.clear();
});

// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('buildMandateBody', () => {
  const form = {
    agent: AGENT, agentId: 'treasury-agent-1', categories: ['VENDOR_INVOICE' as const], perTx: '1000', daily: '2000', weekly: '5000', monthly: '10000',
    threshold: '500', riskTier: 1, days: '30', singleUse: false, recipients: `${VENDOR}\n${OWNER}`,
  };

  it('turns USDC into base units, days into an expiry, and the allowlist into a list', () => {
    const r = buildMandateBody(BIZ, form, 1_000);
    expect('body' in r).toBe(true);
    if ('body' in r) {
      expect(r.body).toMatchObject({
        businessId: BIZ, agent: AGENT, agentId: 'treasury-agent-1', categories: ['VENDOR_INVOICE'], perTxLimit: '1000000000', dailyCap: '2000000000',
        weeklyCap: '5000000000', monthlyCap: '10000000000', approvalThreshold: '500000000', maxRiskTier: 1, singleUse: false, expiresAt: 1_000 + 30 * 86_400,
        recipients: [VENDOR, OWNER],
      });
    }
  });

  it('reports every field problem at once, and sends nothing', () => {
    const r = buildMandateBody('nope', { ...form, agent: '0x1', agentId: ' ', categories: [], perTx: 'abc', threshold: '-1', days: '400', recipients: 'not-an-address' });
    expect('errors' in r).toBe(true);
    if ('errors' in r) {
      expect(Object.keys(r.errors).sort()).toEqual(['agent', 'agentId', 'businessId', 'categories', 'days', 'perTx', 'recipients', 'threshold'].sort());
    }
  });

  it('requires limits that rise, and allows a zero approval threshold', () => {
    const bad = buildMandateBody(BIZ, { ...form, perTx: '3000' });
    expect('errors' in bad && bad.errors.perTx).toMatch(/per transaction ≤ daily/);
    expect('body' in buildMandateBody(BIZ, { ...form, threshold: '0' })).toBe(true);
    expect('body' in buildMandateBody(BIZ, { ...form, recipients: '' })).toBe(true);
  });
});

describe('Founder: mandates', () => {
  it('without a business, offers to register a demo one with a managed owner and then shows the form', async () => {
    const calls = mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [OWNER] } },
      'POST businesses': { status: 201, body: { businessId: BIZ, owner: OWNER, relayerAuthorized: true, status: 'confirmed' } },
      'GET mandates': { status: 200, body: { total: 0, offset: 0, limit: 50, items: [] } },
    });
    wrap(<MandatesView />);
    expect(screen.getByText(/Arc testnet · managed demo keys · not audited/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Create a mandate' })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Register a demo business' }));
    expect(await screen.findByRole('form', { name: 'Create a mandate' })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST businesses')?.body).toMatchObject({ owner: OWNER });
    expect(await screen.findByText(/No mandates yet for this business/)).toBeInTheDocument();
    expect(window.localStorage.getItem('credentia.treasury.business')).toBe(BIZ);
  });

  it('says so when the backend has no demo owners', async () => {
    mockApi({ 'GET businesses/owners': { status: 200, body: { owners: [] } } });
    wrap(<MandatesView />);
    expect(await screen.findByText(/no demo owner keys configured/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register a demo business' })).not.toBeInTheDocument();
  });

  it('lists mandates with status, limits in USDC, spend and the allowlist', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [OWNER] } },
      'GET mandates': { status: 200, body: { total: 2, offset: 0, limit: 50, items: [mandate(), mandate({ mandateId: `0x${'ef'.repeat(32)}`, effectiveStatus: 'REVOKED', status: 'REVOKED', recipients: [] })] } },
    });
    wrap(<MandatesView />);
    await screen.findByText('ACTIVE');
    const items = screen.getAllByText(/^(ACTIVE|REVOKED)$/).map((badge) => badge.closest('li')!);
    expect(items).toHaveLength(2);
    const active = items.find((li) => within(li).queryByText('ACTIVE'));
    expect(active).toBeTruthy();
    expect(within(active!).getByText('1,000.00 USDC')).toBeInTheDocument(); // per payment
    expect(within(active!).getByText('500.00 USDC')).toBeInTheDocument(); // approval threshold
    expect(within(active!).getByText(/400\.00 \/ 400\.00 \/ 400\.00 USDC/)).toBeInTheDocument(); // spent
    expect(within(active!).getByText(VENDOR)).toBeInTheDocument();
    expect(within(active!).getByText('Vendor invoice, Payroll')).toBeInTheDocument();
    const revoked = items.find((li) => within(li).queryByText('REVOKED'))!;
    expect(within(revoked).getByText(/cannot pay anyone/)).toBeInTheDocument();
    expect(within(revoked).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('shows an empty state, a loading failure, and an expired mandate as EXPIRED without a revoke button', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET mandates': { status: 200, body: { total: 1, offset: 0, limit: 50, items: [mandate({ status: 'ACTIVE', effectiveStatus: 'EXPIRED' })] } },
    });
    wrap(<MandatesView />);
    expect(await screen.findByText('EXPIRED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('shows the error when the list cannot be loaded', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET mandates': { status: 404, body: { error: { code: 'BUSINESS_NOT_FOUND', message: 'No such business' } } },
    });
    wrap(<MandatesView />);
    // the list query retries once before giving up
    expect(await screen.findByText('No such business', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('revokes only after a second confirming click, then refreshes the list', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    let revoked = false;
    const calls = mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET mandates': () => ({ status: 200, body: { total: 1, offset: 0, limit: 50, items: [revoked ? mandate({ status: 'REVOKED', effectiveStatus: 'REVOKED' }) : mandate()] } }),
      [`POST mandates/${MANDATE_ID}/revoke`]: () => {
        revoked = true;
        return { status: 200, body: mandate({ status: 'REVOKED', effectiveStatus: 'REVOKED' }) };
      },
    });
    wrap(<MandatesView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(calls.some((c) => c.key.includes('/revoke'))).toBe(false);
    expect(screen.getByText(/The agent loses its authority immediately/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/loses its authority/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(screen.getByText('REVOKED')).toBeInTheDocument());
    expect(calls.filter((c) => c.key.includes('/revoke'))).toHaveLength(1);
  });

  it('shows the backend’s reason when a revoke is refused', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET mandates': { status: 200, body: { total: 1, offset: 0, limit: 50, items: [mandate()] } },
      [`POST mandates/${MANDATE_ID}/revoke`]: { status: 409, body: { error: { code: 'MANDATE_NOT_ACTIVE', message: 'The mandate is not active (revoked, consumed or expired)' } } },
    });
    wrap(<MandatesView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    expect(await screen.findByText(/The mandate is not active/)).toBeInTheDocument();
  });

  it('creates a mandate: validates first, then posts base units', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    const calls = mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET mandates': { status: 200, body: { total: 0, offset: 0, limit: 50, items: [] } },
      'POST mandates': () => ({ status: 201, body: mandate() }),
    });
    wrap(<MandatesView />);
    const form = await screen.findByRole('form', { name: 'Create a mandate' });

    await userEvent.click(within(form).getByRole('button', { name: 'Create mandate' }));
    expect(await within(form).findByText('Enter the agent’s wallet address (0x…).')).toBeInTheDocument();
    expect(within(form).getByText('Give the agent a name or id.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST mandates')).toBe(false);

    await userEvent.type(within(form).getByLabelText('Agent wallet address'), AGENT);
    await userEvent.type(within(form).getByLabelText('Agent name'), 'treasury-agent-1');
    await userEvent.type(within(form).getByLabelText('Recipient allowlist'), VENDOR);
    await userEvent.click(within(form).getByLabelText('Payroll'));
    await userEvent.click(within(form).getByLabelText(/Single use/));
    await userEvent.click(within(form).getByRole('button', { name: 'Create mandate' }));

    expect(await screen.findByText('Mandate created.')).toBeInTheDocument();
    const sent = calls.find((c) => c.key === 'POST mandates')!.body;
    expect(sent).toMatchObject({
      businessId: BIZ, agent: AGENT, agentId: 'treasury-agent-1', categories: ['VENDOR_INVOICE', 'PAYROLL'], perTxLimit: '1000000000', dailyCap: '2000000000',
      weeklyCap: '5000000000', monthlyCap: '10000000000', approvalThreshold: '500000000', maxRiskTier: 1, singleUse: true, recipients: [VENDOR],
    });
    expect(sent.expiresAt).toBeGreaterThan(NOW + 29 * 86400);
    expect(JSON.stringify(sent)).not.toMatch(/privateKey|secret/i);
  });

  it('surfaces a contract-level refusal in words', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET mandates': { status: 200, body: { total: 0, offset: 0, limit: 50, items: [] } },
      'POST mandates': { status: 403, body: { error: { code: 'OWNER_NOT_MANAGED', message: 'The API holds no key for this business\'s owner (testnet demo owners only)' } } },
    });
    wrap(<MandatesView />);
    const form = await screen.findByRole('form', { name: 'Create a mandate' });
    await userEvent.type(within(form).getByLabelText('Agent wallet address'), AGENT);
    await userEvent.type(within(form).getByLabelText('Agent name'), 'a');
    await userEvent.click(within(form).getByRole('button', { name: 'Create mandate' }));
    expect(await screen.findByText(/testnet demo owners only/)).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('Founder: decisions and approvals', () => {
  const log = (items: DecisionView[], extra: Record<string, unknown> = {}) => ({ status: 200, body: { total: items.length, offset: 0, limit: 20, items, linked: true, ...extra } });

  it('shows pending approvals and the decision log, newest first, with integrity marks and explorer links', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    const esc = decision({ seq: 1, decisionId: `0x${'02'.repeat(32)}`, action: 'ESCALATION', outcome: 'ESCALATED', amount: '800000000', riskTier: 2, riskScore: 6200, approvalRef: `0x${'44'.repeat(32)}` });
    const exec = decision({ seq: 2, decisionId: `0x${'03'.repeat(32)}`, outcome: 'EXECUTED', txHash: `0x${'55'.repeat(32)}` });
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET approvals/pending': { status: 200, body: { businessId: BIZ, scanned: 3, totalRecords: 3, items: [esc] } },
      'GET decisions': log([decision(), esc, exec]),
    });
    wrap(<DecisionsView />);

    const pending = await screen.findByRole('heading', { name: 'Pending approvals' });
    const section = pending.closest('section')!;
    expect(await within(section).findByText('800.00 USDC')).toBeInTheDocument();
    expect(within(section).getByText(/risk High \(62%\)/)).toBeInTheDocument();
    expect(within(section).getByText(/Approving is not available in this build/)).toBeInTheDocument();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('2')).toBeInTheDocument(); // newest (seq 2) first
    expect(within(rows[2]).getByText('0')).toBeInTheDocument();
    expect(within(table).getAllByText('hash verified')).toHaveLength(3);
    const link = within(rows[0]).getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringMatching(new RegExp(`/tx/0x${'55'.repeat(32)}$`)));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/Append-only: records are never edited or removed/)).toBeInTheDocument();
  });

  it('flags a record whose hash no longer matches, and a chain that does not link', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET approvals/pending': { status: 200, body: { businessId: BIZ, scanned: 1, totalRecords: 1, items: [] } },
      'GET decisions': log([decision({ hashVerified: false })], { linked: false }),
    });
    wrap(<DecisionsView />);
    expect(await screen.findByText('hash mismatch')).toBeInTheDocument();
    expect(screen.getByText(/hash chain on this page does not link up/)).toBeInTheDocument();
    expect(screen.getByText('Nothing is waiting for you.')).toBeInTheDocument();
  });

  it('has empty and error states, and says when only the newest records were checked', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET approvals/pending': { status: 200, body: { businessId: BIZ, scanned: 200, totalRecords: 450, items: [] } },
      'GET decisions': { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'DecisionLog address is not configured' } } },
    });
    wrap(<DecisionsView />);
    expect(await screen.findByText('DecisionLog address is not configured', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByText(/Only the newest 200 of 450 records were checked/)).toBeInTheDocument();
  });

  it('shows an empty log kindly', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET approvals/pending': { status: 200, body: { businessId: BIZ, scanned: 0, totalRecords: 0, items: [] } },
      'GET decisions': log([]),
    });
    wrap(<DecisionsView />);
    expect(await screen.findByText('No decisions recorded for this business yet.')).toBeInTheDocument();
  });

  it('pages through the log', async () => {
    window.localStorage.setItem('credentia.treasury.business', BIZ);
    const calls = mockApi({
      'GET businesses/owners': { status: 200, body: { owners: [] } },
      'GET approvals/pending': { status: 200, body: { businessId: BIZ, scanned: 0, totalRecords: 0, items: [] } },
      'GET decisions': (_b, url) => {
        const offset = Number(new URL(url, 'http://x').searchParams.get('offset'));
        return { status: 200, body: { total: 45, offset, limit: 20, items: [decision({ seq: offset, decisionId: `0x${offset.toString(16).padStart(64, '0')}` })], linked: true } };
      },
    });
    wrap(<DecisionsView />);
    expect(await screen.findByText(/45 records · page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Newer' }));
    expect(await screen.findByText(/page 2 of 3/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('offset=20&limit=20'))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('Agent: check a payment', () => {
  const fill = async (over: { amount?: string } = {}) => {
    await userEvent.type(screen.getByLabelText('Mandate ID'), MANDATE_ID);
    await userEvent.type(screen.getByLabelText('Agent wallet address'), AGENT);
    await userEvent.type(screen.getByLabelText('Recipient wallet address'), VENDOR);
    await userEvent.type(screen.getByLabelText('Amount (USDC)'), over.amount ?? '250');
  };
  const result = (over: Record<string, unknown> = {}) => ({
    mandateId: MANDATE_ID, allowed: true, needsApproval: false, reason: 'NONE',
    remaining: { daily: '1600000000', weekly: '4600000000', monthly: '9600000000' }, checkedAt: NOW, ...over,
  });

  it('asks the mandate, in base units, and shows the room left when allowed', async () => {
    const calls = mockApi({ [`POST mandates/${MANDATE_ID}/validate`]: { status: 200, body: result() } });
    wrap(<ValidateView />);
    expect(screen.getByText(/This only reads: nothing is spent and nothing is recorded/)).toBeInTheDocument();
    await fill();
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'PAYROLL');
    await userEvent.selectOptions(screen.getByLabelText('Risk tier of this payment'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Check payment' }));

    const status = await screen.findByRole('status', { name: 'Result' });
    expect(within(status).getByText('Allowed')).toBeInTheDocument();
    expect(within(status).getByText('1,600.00')).toBeInTheDocument();
    expect(within(status).getByText(/Reason code: NONE/)).toBeInTheDocument();
    const sent = calls[0].body;
    expect(sent).toMatchObject({ agent: AGENT, recipient: VENDOR, amount: '250000000', category: 'PAYROLL', riskTier: 1 });
    expect(sent.paymentId).toMatch(/^pay-/);
  });

  it('says plainly when human approval is needed', async () => {
    mockApi({ [`POST mandates/${MANDATE_ID}/validate`]: { status: 200, body: result({ needsApproval: true }) } });
    wrap(<ValidateView />);
    await fill({ amount: '800' });
    await userEvent.click(screen.getByRole('button', { name: 'Check payment' }));
    expect(await screen.findByText('Allowed, with human approval')).toBeInTheDocument();
    expect(screen.getByText(/must sign it before the agent can use it/)).toBeInTheDocument();
  });

  it.each([
    ['OVER_PER_TX_LIMIT', /over the per-transaction limit/],
    ['RECIPIENT_NOT_ALLOWED', /not on the mandate’s allowlist/],
    ['REVOKED', /owner revoked this mandate/],
    ['WRONG_AGENT', /not the one the mandate was granted to/],
    ['OVER_DAILY_CAP', /daily cap/],
  ])('explains a refusal: %s', async (reason, text) => {
    mockApi({ [`POST mandates/${MANDATE_ID}/validate`]: { status: 200, body: result({ allowed: false, reason, remaining: { daily: '0', weekly: '0', monthly: '0' } }) } });
    wrap(<ValidateView />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Check payment' }));
    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText(`Reason code: ${reason}`)).toBeInTheDocument();
    expect(screen.queryByText(/Room left/)).not.toBeInTheDocument();
  });

  it('validates the form before calling anything', async () => {
    const calls = mockApi({});
    wrap(<ValidateView />);
    await userEvent.click(screen.getByRole('button', { name: 'Check payment' }));
    expect(await screen.findByText(/A mandate ID is 0x followed by 64 hex characters/)).toBeInTheDocument();
    expect(screen.getAllByText('Enter the agent’s wallet address (0x…).').length).toBe(1);
    expect(screen.getByText('Enter the recipient’s wallet address (0x…).')).toBeInTheDocument();
    expect(screen.getByText(/Enter an amount like 250/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows a backend error and lets you try again with a new payment id', async () => {
    mockApi({ [`POST mandates/${MANDATE_ID}/validate`]: { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'MandateRegistry address is not configured' } } } });
    wrap(<ValidateView />);
    await fill();
    const before = (screen.getByLabelText('Payment ID') as HTMLInputElement).value;
    await userEvent.click(screen.getByRole('button', { name: 'Check payment' }));
    expect(await screen.findByText('MandateRegistry address is not configured')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New ID' }));
    expect((screen.getByLabelText('Payment ID') as HTMLInputElement).value).not.toBe(before);
  });
});
