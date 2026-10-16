'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAccount } from '@/components/account';
import { CasePanel } from '@/components/evidence/CasePanel';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { REGISTRY_ADDRESS } from '@/lib/chain';
import {
  addDays, CREDENTIAL_TYPES, credentialFormSchema, expiryError, prepareCredential, toDateInput, type CredentialFormValues, type PreparedCredential,
} from '@/lib/credential-form';
import { cn } from '@/lib/utils';

const STAGES = ['Prepared', 'Awaiting wallet signature', 'Submitted to testnet', 'Confirmed on testnet'] as const;
const NOT_CONFIGURED = 'Testnet issuance is not configured in this deployment. This screen demonstrates the credential preparation flow.';
const BROADCAST_DISABLED = 'Testnet broadcasting is disabled in this build. This screen demonstrates the credential preparation flow and shows the unsigned request.';

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.12em]">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-stop">{error}</p>}
    </div>
  );
}

export default function CreateCredentialPage() {
  const { address, isConnected, connect, busy } = useAccount();
  const [prepared, setPrepared] = useState<PreparedCredential | null>(null);
  const today = useMemo(() => new Date(), []);
  const minDate = toDateInput(today);
  const maxDate = toDateInput(addDays(today, 365));

  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialFormSchema),
    mode: 'onTouched',
    defaultValues: { subject: '', credentialType: 'Identity Verification', customType: '', expiresOn: '', metadataUri: '', notes: '' },
  });
  const type = watch('credentialType');
  const err = (name: keyof CredentialFormValues) => errors[name]?.message as string | undefined;
  const aria = (name: keyof CredentialFormValues, hint = false) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined,
  });

  const onSubmit = (values: CredentialFormValues) => {
    const problem = expiryError(values.expiresOn);
    if (problem) {
      setError('expiresOn', { message: problem });
      return;
    }
    if (!address) return;
    // Nothing is signed or sent: this only builds the request a wallet would be asked to sign.
    setPrepared(prepareCredential(values, address));
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="container max-w-3xl space-y-8 py-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Monad testnet / preparation only</p>
            <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Create a credential</h1>
            <p className="mt-3 text-ink-soft">Prepare a signed statement about an address. Nothing is broadcast from this page.</p>
          </div>

          <div role="note" className="rounded border-2 border-signal bg-signal-soft px-4 py-3 text-sm">
            {REGISTRY_ADDRESS ? BROADCAST_DISABLED : NOT_CONFIGURED}
          </div>

          {!isConnected && (
            <CasePanel title="Passkey account" tone="review">
              <p className="text-sm">Viewing and checking profiles does not require an account. Issuing a credential does.</p>
              <div className="mt-3">
                <button type="button" className="btn-signal" onClick={() => void connect()} disabled={busy}>
                  Sign in with passkey to prepare credential
                </button>
              </div>
            </CasePanel>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="card space-y-5" aria-label="Credential details">
            <Field id="subject" label="Subject address" error={err('subject')}>
              <input id="subject" className={cn('input font-mono', errors.subject && 'border-stop')} placeholder="0x…" autoComplete="off" spellCheck={false} {...aria('subject')} {...register('subject')} />
            </Field>

            <Field id="credentialType" label="Credential type" error={err('credentialType')}>
              <select id="credentialType" className="input" {...aria('credentialType')} {...register('credentialType')}>
                {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            {type === 'Custom' && (
              <Field id="customType" label="Custom type name" error={err('customType')}>
                <input id="customType" className={cn('input', errors.customType && 'border-stop')} {...aria('customType')} {...register('customType')} />
              </Field>
            )}

            <Field id="expiresOn" label="Expiration date" hint="Between today and one year from today." error={err('expiresOn')}>
              <input id="expiresOn" type="date" min={minDate} max={maxDate} className={cn('input font-mono', errors.expiresOn && 'border-stop')} {...aria('expiresOn', true)} {...register('expiresOn')} />
            </Field>

            <Field id="metadataUri" label="Metadata URI (optional)" hint="A JSON file with additional credential details." error={err('metadataUri')}>
              <input id="metadataUri" className={cn('input font-mono', errors.metadataUri && 'border-stop')} placeholder="ipfs://… or https://…" autoComplete="off" spellCheck={false} {...aria('metadataUri', true)} {...register('metadataUri')} />
            </Field>

            <Field id="notes" label="Notes (optional)" hint="Private local note — not stored on-chain." error={err('notes')}>
              <textarea id="notes" className={cn('input h-24 py-2', errors.notes && 'border-stop')} {...aria('notes', true)} {...register('notes')} />
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary" disabled={!isConnected}>Prepare credential</button>
              {!isConnected && <span className="text-sm text-ink-soft">Connect a wallet to enable this button.</span>}
            </div>
          </form>

          {prepared && (
            <CasePanel title="Prepared credential" tone="signal" label={<EvidenceLabel tone="signal">UNSIGNED / NOT BROADCAST</EvidenceLabel>} aria-live="polite">
              <ol className="mb-5 grid gap-2 sm:grid-cols-4" aria-label="Issuance stages">
                {STAGES.map((s, i) => (
                  <li key={s} aria-current={i === 0 ? 'step' : undefined} className={cn('rounded border px-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em]', i === 0 ? 'border-signal border-b-2 bg-signal-soft' : 'border-line text-ink-soft')}>
                    {i === 0 ? 'Now: ' : 'Not reached: '}{s}
                  </li>
                ))}
              </ol>
              <dl className="divide-y divide-line text-sm">
                {([
                  ['Credential type', prepared.credentialType],
                  ['Type hash', prepared.credentialTypeHash],
                  ['Subject', prepared.subject],
                  ['Issuer (your wallet)', prepared.issuer],
                  ['Expires (UTC)', new Date(prepared.expiryTimestamp * 1000).toISOString()],
                  ['Metadata URI', prepared.metadataUri ?? 'None'],
                  ['Data hash', prepared.dataHash ?? 'None'],
                ] as const).map(([k, v]) => (
                  <div key={k} className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">{k}</dt>
                    <dd className="break-all font-mono">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-ink-soft">
                No transaction was sent, so there is no transaction hash or credential ID. Your note, if any, stays in this browser and is not part of the request.
              </p>
            </CasePanel>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
