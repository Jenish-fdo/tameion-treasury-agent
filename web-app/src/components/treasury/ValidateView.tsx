'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { BUSINESS_ID } from '@/hooks/useBusinessId';
import {
  CATEGORIES, InvalidUsdcError, REASON_TEXT, RISK_TIERS, baseUnitsToUsdc, errorText, treasuryFetch, usdcToBaseUnits, type PayResult, type ValidateResult,
} from '@/lib/treasury';
import { TestnetBanner } from './TestnetBanner';

const newPaymentId = () => `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Agent: check a payment against a mandate before proposing it. Read-only: nothing is spent or recorded. */
export function ValidateView() {
  const [mandateId, setMandateId] = useState('');
  const [agent, setAgent] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('VENDOR_INVOICE');
  const [riskTier, setRiskTier] = useState(0);
  const [paymentId, setPaymentId] = useState(newPaymentId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rationale, setRationale] = useState('');
  const [checked, setChecked] = useState<Record<string, unknown> | null>(null);

  const check = useMutation({
    mutationFn: (v: { mandateId: string; body: Record<string, unknown> }) => treasuryFetch<ValidateResult>(`mandates/${v.mandateId}/validate`, { method: 'POST', body: v.body }),
  });

  const pay = useMutation({
    mutationFn: (v: { mandateId: string; body: Record<string, unknown> }) => treasuryFetch<PayResult>(`mandates/${v.mandateId}/pay`, { method: 'POST', body: v.body }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!BUSINESS_ID.test(mandateId.trim())) next.mandateId = 'A mandate ID is 0x followed by 64 hex characters.';
    if (!isAddress(agent.trim(), { strict: false })) next.agent = 'Enter the agent’s wallet address (0x…).';
    if (!isAddress(recipient.trim(), { strict: false })) next.recipient = 'Enter the recipient’s wallet address (0x…).';
    let base = '';
    try {
      base = usdcToBaseUnits(amount);
    } catch (err) {
      next.amount = err instanceof InvalidUsdcError ? err.message : 'Enter an amount.';
    }
    if (!paymentId.trim()) next.paymentId = 'A payment ID is required.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    pay.reset();
    setChecked({ recipient: recipient.trim(), amount: base, category, riskTier, paymentId: paymentId.trim() });
    check.mutate({
      mandateId: mandateId.trim(),
      body: { agent: agent.trim(), recipient: recipient.trim(), amount: base, category, riskTier, paymentId: paymentId.trim() },
    });
  };

  const r = check.data;
  return (
    <div className="container max-w-3xl space-y-6 py-10 sm:py-14">
      <div>
        <p className="dc-label">Agent</p>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Check a payment</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Before proposing a payment, ask the mandate registry whether this mandate allows it. This only reads: nothing is spent and nothing is recorded.
        </p>
      </div>
      <TestnetBanner />

      <form onSubmit={submit} noValidate aria-label="Check a payment" className="dc-sheet dc-paper space-y-5 p-6">
        <div>
          <label htmlFor="mandateId" className="dc-label text-ink">Mandate ID</label>
          <input id="mandateId" className="input mt-1.5 font-mono" placeholder="0x…" spellCheck={false} autoComplete="off" value={mandateId} onChange={(e) => setMandateId(e.target.value)} aria-invalid={!!errors.mandateId} />
          {errors.mandateId && <p role="alert" className="mt-1 text-sm text-stop">{errors.mandateId}</p>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="v-agent" className="dc-label text-ink">Agent wallet address</label>
            <input id="v-agent" className="input mt-1.5 font-mono" placeholder="0x…" spellCheck={false} autoComplete="off" value={agent} onChange={(e) => setAgent(e.target.value)} aria-invalid={!!errors.agent} />
            {errors.agent && <p role="alert" className="mt-1 text-sm text-stop">{errors.agent}</p>}
          </div>
          <div>
            <label htmlFor="v-recipient" className="dc-label text-ink">Recipient wallet address</label>
            <input id="v-recipient" className="input mt-1.5 font-mono" placeholder="0x…" spellCheck={false} autoComplete="off" value={recipient} onChange={(e) => setRecipient(e.target.value)} aria-invalid={!!errors.recipient} />
            {errors.recipient && <p role="alert" className="mt-1 text-sm text-stop">{errors.recipient}</p>}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label htmlFor="v-amount" className="dc-label text-ink">Amount (USDC)</label>
            <input id="v-amount" inputMode="decimal" className="input mt-1.5" placeholder="250.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
            {errors.amount && <p role="alert" className="mt-1 text-sm text-stop">{errors.amount}</p>}
          </div>
          <div>
            <label htmlFor="v-category" className="dc-label text-ink">Category</label>
            <select id="v-category" className="input mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="v-risk" className="dc-label text-ink">Risk tier of this payment</label>
            <select id="v-risk" className="input mt-1.5" value={riskTier} onChange={(e) => setRiskTier(Number(e.target.value))}>
              {RISK_TIERS.map((t) => <option key={t.n} value={t.n}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="v-payment" className="dc-label text-ink">Payment ID</label>
            <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => setPaymentId(newPaymentId())}>New ID</button>
          </div>
          <input id="v-payment" className="input mt-1.5 font-mono" autoComplete="off" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} aria-invalid={!!errors.paymentId} />
          {errors.paymentId && <p role="alert" className="mt-1 text-sm text-stop">{errors.paymentId}</p>}
        </div>

        <button type="submit" className="btn-primary" disabled={check.isPending}>
          {check.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Check payment
        </button>
      </form>

      {check.isError && <p role="alert" className="rounded border border-stop bg-stop-soft p-3 text-sm">{errorText(check.error)}</p>}

      {r && (
        <section aria-label="Result" role="status" className={`rounded border p-5 ${r.allowed ? 'border-go bg-go-soft' : 'border-stop bg-stop-soft'}`}>
          <p data-verdict={r.allowed ? 'allowed' : 'refused'} className="font-display text-3xl">
            {r.allowed ? (r.needsApproval ? 'Allowed, with human approval' : 'Allowed') : 'Not allowed'}
          </p>
          <p className="mt-2 text-sm">{REASON_TEXT[r.reason] ?? r.reason}</p>
          {r.allowed && r.needsApproval && (
            <p className="mt-2 text-sm">This amount is at or above the mandate’s approval threshold, so the owner (or an approver) must sign it before the agent can use it.</p>
          )}
          {r.allowed && (
            <p className="mt-3 text-sm">
              Room left after this check, before this payment: <strong>{baseUnitsToUsdc(r.remaining.daily)}</strong> today, <strong>{baseUnitsToUsdc(r.remaining.weekly)}</strong> this week,{' '}
              <strong>{baseUnitsToUsdc(r.remaining.monthly)}</strong> this month (USDC).
            </p>
          )}
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Reason code: {r.reason}</p>
        </section>
      )}

      {r?.allowed && checked && (
        <section aria-label="Send the payment" className="dc-sheet dc-paper space-y-4 p-6">
          <h2 className="font-display text-2xl">Send it now</h2>
          <p className="text-sm text-ink-soft">
            The agent checks the mandate again, sends the USDC from its wallet to the recipient, and writes the decision, with the transfer’s transaction, to the log. Testnet USDC only.
          </p>
          <div>
            <label htmlFor="v-rationale" className="dc-label text-ink">Why the agent is paying (kept off-chain; its hash goes in the log)</label>
            <textarea id="v-rationale" className="input mt-1.5 min-h-[88px]" maxLength={2000} placeholder="Invoice 114 matches PO 7; vendor is on the allowlist." value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={pay.isPending || !rationale.trim() || r.needsApproval}
            onClick={() => pay.mutate({ mandateId: mandateId.trim(), body: { ...checked, rationale: rationale.trim() } })}
          >
            {pay.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {r.needsApproval ? 'Needs approval first' : 'Send USDC'}
          </button>
          {r.needsApproval && <p className="text-sm">Over the approval threshold: ask the owner to approve, then pay with that approval through the API.</p>}
          {pay.isError && <p role="alert" className="rounded border border-stop bg-stop-soft p-3 text-sm">{errorText(pay.error)}</p>}
          {pay.data && (
            <p role="status" data-pay-status={pay.data.status} className={`rounded border p-3 text-sm ${pay.data.status === 'executed' ? 'border-go bg-go-soft' : 'border-stop bg-stop-soft'}`}>
              {pay.data.status === 'executed' ? 'Paid. ' : pay.data.status === 'pending' ? 'Submitted, not confirmed yet. ' : `Not sent (${pay.data.reason ?? pay.data.status}). It is in the decision log. `}
              {pay.data.explorerUrl && (
                <a className="font-semibold underline underline-offset-4" href={pay.data.explorerUrl} target="_blank" rel="noopener noreferrer">
                  View the transfer on the Arc explorer<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
