'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { useBusinessId, BUSINESS_ID } from '@/hooks/useBusinessId';
import {
  CATEGORIES, InvalidUsdcError, RISK_TIERS, baseUnitsToUsdc, categoryLabel, errorText, riskLabel, treasuryFetch, usdcToBaseUnits,
  type CategoryId, type MandateView, type Page,
} from '@/lib/treasury';
import { shortenAddress } from '@/lib/utils';
import { BusinessPicker } from './BusinessPicker';
import { TestnetBanner } from './TestnetBanner';

const DAY = 86_400;
const fmtDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'border-go bg-go-soft text-go',
  REVOKED: 'border-stop bg-stop-soft text-stop',
  EXPIRED: 'border-review bg-review-soft text-review',
  CONSUMED: 'border-line bg-paper-deep text-ink',
  NONE: 'border-line bg-paper-deep text-ink',
};

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="dc-label text-ink">{label}</label>
        {hint && <span className="font-mono text-[11px] text-ink-soft">{hint}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
      {error && <p role="alert" className="mt-1 text-sm text-stop">{error}</p>}
    </div>
  );
}

interface FormState {
  agent: string; agentId: string; categories: CategoryId[]; perTx: string; daily: string; weekly: string; monthly: string;
  threshold: string; riskTier: number; days: string; singleUse: boolean; recipients: string;
}
const EMPTY: FormState = {
  agent: '', agentId: '', categories: ['VENDOR_INVOICE'], perTx: '1000', daily: '2000', weekly: '5000', monthly: '10000',
  threshold: '500', riskTier: 1, days: '30', singleUse: false, recipients: '',
};

/** Validates the form and builds the API body. Returns field errors, or the body. */
export function buildMandateBody(businessId: string, f: FormState, nowSec = Math.floor(Date.now() / 1000)): { errors: Record<string, string> } | { body: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  if (!isAddress(f.agent.trim(), { strict: false })) errors.agent = 'Enter the agent’s wallet address (0x…).';
  if (!f.agentId.trim()) errors.agentId = 'Give the agent a name or id.';
  if (f.categories.length === 0) errors.categories = 'Allow at least one category.';
  const amounts: Record<string, string> = {};
  for (const [key, value, allowZero] of [['perTx', f.perTx, false], ['daily', f.daily, false], ['weekly', f.weekly, false], ['monthly', f.monthly, false], ['threshold', f.threshold, true]] as const) {
    try {
      amounts[key] = usdcToBaseUnits(value, { allowZero });
    } catch (e) {
      errors[key] = e instanceof InvalidUsdcError ? e.message : 'Enter an amount.';
    }
  }
  if (!errors.perTx && !errors.daily && !errors.weekly && !errors.monthly) {
    const [p, d, w, m] = [amounts.perTx, amounts.daily, amounts.weekly, amounts.monthly].map(BigInt);
    if (!(p <= d && d <= w && w <= m)) errors.perTx = 'Limits must rise: per transaction ≤ daily ≤ weekly ≤ monthly.';
  }
  const days = Number(f.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) errors.days = 'Choose 1 to 365 days.';
  const recipients = f.recipients.split(/[\s,]+/).map((r) => r.trim()).filter(Boolean);
  if (recipients.some((r) => !isAddress(r, { strict: false }))) errors.recipients = 'Every recipient must be a wallet address (0x…), one per line.';
  else if (recipients.length > 100) errors.recipients = 'At most 100 recipients when creating a mandate.';
  if (!BUSINESS_ID.test(businessId)) errors.businessId = 'Choose a business first.';
  if (Object.keys(errors).length > 0) return { errors };
  return {
    body: {
      businessId,
      agent: f.agent.trim(),
      agentId: f.agentId.trim(),
      categories: f.categories,
      perTxLimit: amounts.perTx,
      dailyCap: amounts.daily,
      weeklyCap: amounts.weekly,
      monthlyCap: amounts.monthly,
      approvalThreshold: amounts.threshold,
      maxRiskTier: f.riskTier,
      singleUse: f.singleUse,
      expiresAt: nowSec + days * DAY,
      recipients,
    },
  };
}

function CreateMandateForm({ businessId, onCreated }: { businessId: string; onCreated: () => void }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => treasuryFetch<MandateView>('mandates', { method: 'POST', body }),
    onSuccess: () => {
      setF(EMPTY);
      onCreated();
    },
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = buildMandateBody(businessId, f);
    if ('errors' in r) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    create.mutate(r.body);
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Create a mandate" className="dc-sheet dc-paper space-y-5 p-6">
      <h2 className="font-display text-2xl">Grant an agent a mandate</h2>
      <p className="text-sm text-ink-soft">
        A mandate says what one AI agent may pay: to whom, how much, in which categories, until when. You can revoke it at any time. Amounts are in USDC.
      </p>
      {errors.businessId && <p role="alert" className="text-sm text-stop">{errors.businessId}</p>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="agent" label="Agent wallet address" error={errors.agent}>
          <input id="agent" className="input font-mono" placeholder="0x…" spellCheck={false} autoComplete="off" value={f.agent} onChange={(e) => set('agent', e.target.value)} aria-invalid={!!errors.agent} />
        </Field>
        <Field id="agentId" label="Agent name" hint="used in the decision log" error={errors.agentId}>
          <input id="agentId" className="input" placeholder="treasury-agent-1" autoComplete="off" value={f.agentId} onChange={(e) => set('agentId', e.target.value)} aria-invalid={!!errors.agentId} />
        </Field>
      </div>

      <fieldset>
        <legend className="dc-label text-ink">Allowed payment categories</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {CATEGORIES.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#3F5BFF]"
                checked={f.categories.includes(c.id)}
                onChange={(e) => set('categories', e.target.checked ? [...f.categories, c.id] : f.categories.filter((x) => x !== c.id))}
              />
              {c.label}
            </label>
          ))}
        </div>
        {errors.categories && <p role="alert" className="mt-1 text-sm text-stop">{errors.categories}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="perTx" label="Per payment" hint="USDC" error={errors.perTx}>
          <input id="perTx" inputMode="decimal" className="input" value={f.perTx} onChange={(e) => set('perTx', e.target.value)} aria-invalid={!!errors.perTx} />
        </Field>
        <Field id="daily" label="Daily cap" hint="USDC" error={errors.daily}>
          <input id="daily" inputMode="decimal" className="input" value={f.daily} onChange={(e) => set('daily', e.target.value)} aria-invalid={!!errors.daily} />
        </Field>
        <Field id="weekly" label="Weekly cap" hint="USDC" error={errors.weekly}>
          <input id="weekly" inputMode="decimal" className="input" value={f.weekly} onChange={(e) => set('weekly', e.target.value)} aria-invalid={!!errors.weekly} />
        </Field>
        <Field id="monthly" label="Monthly cap" hint="USDC" error={errors.monthly}>
          <input id="monthly" inputMode="decimal" className="input" value={f.monthly} onChange={(e) => set('monthly', e.target.value)} aria-invalid={!!errors.monthly} />
        </Field>
      </div>
      <p className="text-xs text-ink-soft">Day, week and month are fixed windows (UTC day, 7 days, 30 days), so right at a window boundary an agent could spend close to twice a cap.</p>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="threshold" label="Human approval from" hint="USDC; 0 = always" error={errors.threshold}>
          <input id="threshold" inputMode="decimal" className="input" value={f.threshold} onChange={(e) => set('threshold', e.target.value)} aria-invalid={!!errors.threshold} />
        </Field>
        <Field id="riskTier" label="Highest risk tier allowed">
          <select id="riskTier" className="input" value={f.riskTier} onChange={(e) => set('riskTier', Number(e.target.value))}>
            {RISK_TIERS.filter((t) => t.n <= 2).map((t) => <option key={t.n} value={t.n}>{t.label}</option>)}
          </select>
        </Field>
        <Field id="days" label="Valid for" hint="days, 1 to 365" error={errors.days}>
          <input id="days" inputMode="numeric" className="input" value={f.days} onChange={(e) => set('days', e.target.value)} aria-invalid={!!errors.days} />
        </Field>
      </div>

      <Field id="recipients" label="Recipient allowlist" hint="one wallet address per line; empty = nobody can be paid" error={errors.recipients}>
        <textarea id="recipients" rows={3} className="input h-auto font-mono" spellCheck={false} value={f.recipients} onChange={(e) => set('recipients', e.target.value)} aria-invalid={!!errors.recipients} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[#3F5BFF]" checked={f.singleUse} onChange={(e) => set('singleUse', e.target.checked)} />
        Single use: the mandate ends after its first payment
      </label>

      {create.isError && <p role="alert" className="rounded border border-stop bg-stop-soft p-3 text-sm">{errorText(create.error)}</p>}
      {create.isSuccess && <p role="status" className="rounded border border-go bg-go-soft p-3 text-sm">Mandate created.</p>}

      <button type="submit" className="btn-primary" disabled={create.isPending}>
        {create.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        Create mandate
      </button>
    </form>
  );
}

function MandateCard({ m, onRevoked }: { m: MandateView; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const revoke = useMutation({
    mutationFn: () => treasuryFetch<MandateView>(`mandates/${m.mandateId}/revoke`, { method: 'POST', body: { reason: 'revoked by the business owner in the founder screen' } }),
    onSuccess: () => {
      setConfirming(false);
      onRevoked();
    },
  });
  return (
    <li className="dc-sheet bg-sheet p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-ink-soft">{shortenAddress(m.mandateId, 6)}</p>
        <span data-status={m.effectiveStatus} className={`inline-flex rounded-[3px] border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${STATUS_STYLE[m.effectiveStatus] ?? STATUS_STYLE.NONE}`}>
          {m.effectiveStatus}
        </span>
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="dc-label">Agent</dt><dd className="font-mono text-xs">{m.agent}</dd></div>
        <div><dt className="dc-label">Expires</dt><dd>{fmtDate(m.expiresAt)}</dd></div>
        <div><dt className="dc-label">Per payment</dt><dd>{baseUnitsToUsdc(m.perTxLimit)} USDC</dd></div>
        <div><dt className="dc-label">Human approval from</dt><dd>{m.approvalThreshold === '0' ? 'every payment' : `${baseUnitsToUsdc(m.approvalThreshold)} USDC`}</dd></div>
        <div><dt className="dc-label">Caps (day / week / month)</dt><dd>{baseUnitsToUsdc(m.dailyCap)} / {baseUnitsToUsdc(m.weeklyCap)} / {baseUnitsToUsdc(m.monthlyCap)} USDC</dd></div>
        <div><dt className="dc-label">Spent so far (day / week / month)</dt><dd>{baseUnitsToUsdc(m.spend.day)} / {baseUnitsToUsdc(m.spend.week)} / {baseUnitsToUsdc(m.spend.month)} USDC</dd></div>
        <div><dt className="dc-label">Categories</dt><dd>{m.categories.map(categoryLabel).join(', ')}</dd></div>
        <div><dt className="dc-label">Highest risk tier</dt><dd>{riskLabel(m.maxRiskTier)}{m.singleUse ? ' · single use' : ''}</dd></div>
      </dl>
      <div className="mt-3 text-sm">
        <p className="dc-label">Allowed recipients</p>
        {m.recipients === null ? (
          <p className="text-ink-soft">The list could not be read from the chain right now.</p>
        ) : m.recipients.length === 0 ? (
          <p className="text-ink-soft">None: this mandate cannot pay anyone.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 font-mono text-xs">{m.recipients.map((r) => <li key={r}>{r}</li>)}</ul>
        )}
      </div>

      {m.effectiveStatus === 'ACTIVE' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <span className="text-sm font-semibold">Revoke this mandate now? The agent loses its authority immediately.</span>
              <button type="button" className="btn-primary" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
                {revoke.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                Confirm revoke
              </button>
              <button type="button" className="btn-secondary" disabled={revoke.isPending} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>Revoke</button>
          )}
        </div>
      )}
      {revoke.isError && <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-2 text-sm">{errorText(revoke.error)}</p>}
    </li>
  );
}

/** Founder: create and revoke mandates for AI agents. */
export function MandatesView() {
  const { businessId, setBusinessId, ready } = useBusinessId();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['mandates', businessId],
    queryFn: () => treasuryFetch<Page<MandateView>>(`mandates?businessId=${businessId}&limit=50`),
    enabled: BUSINESS_ID.test(businessId),
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['mandates', businessId] });

  return (
    <div className="container max-w-4xl space-y-6 py-10 sm:py-14">
      <div>
        <p className="dc-label">Founder</p>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Agent mandates</h1>
      </div>
      <TestnetBanner />
      {ready && <BusinessPicker businessId={businessId} onChange={setBusinessId} />}

      {BUSINESS_ID.test(businessId) && (
        <>
          <CreateMandateForm businessId={businessId} onCreated={refresh} />
          <section aria-labelledby="mandates-heading">
            <h2 id="mandates-heading" className="font-display text-2xl">Your mandates</h2>
            {list.isPending ? (
              <p role="status" className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading mandates…</p>
            ) : list.isError ? (
              <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-3 text-sm">{errorText(list.error)}</p>
            ) : list.data.items.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No mandates yet for this business. Create the first one above.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {[...list.data.items].reverse().map((m) => <MandateCard key={m.mandateId} m={m} onRevoked={refresh} />)}
              </ul>
            )}
            {list.data && list.data.total !== null && list.data.total > list.data.items.length && (
              <p className="mt-3 text-sm text-ink-soft">Showing the first {list.data.items.length} of {list.data.total} mandates.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
