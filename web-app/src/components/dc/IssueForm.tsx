'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getAddress, type Hex } from 'viem';
import { Loader2 } from 'lucide-react';
import { useAccount } from '@/components/account';
import { useCredentialStatus } from '@/hooks/useCredentialStatus';
import { useIssuerAuthorization } from '@/hooks/useIssuerAuthorization';
import {
  DEMO_ISSUER, DESCRIPTION_MAX, expiryToUnix, formSchema, hashRecord, idForPayload, randomSalt, receiptPath, typeHash, verifyPath,
  type FormValues, type SharePayload,
} from '@/lib/dc/credential';
import { fmtExpiry, fmtUnix } from '@/lib/dc/format';
import { isAnchoringEnabled, registryAddress, writeErrorMessage, writeRegistry } from '@/lib/dc/registry';
import { saveIssued } from '@/lib/dc/store';
import { shortenAddress } from '@/lib/utils';
import { CopilotDraftPanel } from './Copilot';
import { CredentialCard } from './CredentialCard';
import { PasskeyButton } from './PasskeyButton';
import { ShareBlock } from './ShareBlock';

type Stage = 'idle' | 'wallet' | 'confirming' | 'done' | 'error';

const ISSUE_FAILED = 'Could not issue the credential. Nothing was recorded. Check your connection and try again.';

export function IssueForm() {
  const { address, isConnected, signer } = useAccount();
  const auth = useIssuerAuthorization(address);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: Hex; payload: SharePayload } | null>(null);

  const { register, handleSubmit, formState: { errors }, watch, reset, setValue } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { title: '', recipientName: '', holder: '', description: '', expiryDate: '' },
  });
  const descLen = (watch('description') ?? '').length;

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const parsed = formSchema.parse(values);
    const holder = getAddress(parsed.holder);
    const expiry = expiryToUnix(parsed.expiryDate);
    const record = { title: parsed.title, recipientName: parsed.recipientName, description: parsed.description, salt: randomSalt() };
    const now = Math.floor(Date.now() / 1000);

    try {
      if (!isAnchoringEnabled || !registryAddress) {
        // Demo mode: nothing is sent to a chain, and the result says so everywhere it appears.
        const payload: SharePayload = { v: 1, ...record, issuer: address ? getAddress(address) : DEMO_ISSUER, holder, expiry, issuedAt: now, demo: true };
        const id = idForPayload(payload);
        saveIssued({ id, payload });
        setIssued({ id, payload });
        setStage('done');
        return;
      }

      if (!signer || !address) throw new Error('Sign in with a passkey to issue.');
      setStage('confirming');
      // Signed in this tab by the passkey account and sent straight to Monad. No extension, no relayer.
      const hash = await writeRegistry(signer, {
        functionName: 'issueCredential',
        args: [holder, typeHash(record.title), hashRecord(record), BigInt(expiry)],
      });

      const payload: SharePayload = { v: 1, ...record, issuer: getAddress(address), holder, expiry, issuedAt: now, tx: hash };
      const id = idForPayload(payload);
      saveIssued({ id, payload });
      setIssued({ id, payload });
      setStage('done');
    } catch (e) {
      setError(writeErrorMessage(e, ISSUE_FAILED));
      setStage('error');
    }
  };

  if (stage === 'done' && issued) {
    return (
      <div className="space-y-4">
        <Progress stage="done" />
        <IssuedResult id={issued.id} payload={issued.payload} onReset={() => { setIssued(null); setStage('idle'); reset(); }} />
      </div>
    );
  }

  const busy = stage === 'wallet' || stage === 'confirming';
  const needsAccount = isAnchoringEnabled && !isConnected;
  const blocked = needsAccount || auth.authorized === false;

  const fillExample = () => {
    const opts = { shouldValidate: true, shouldDirty: true } as const;
    setValue('title', 'Certificate of Completion', opts);
    setValue('recipientName', 'Alex Chen', opts);
    setValue('holder', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', opts);
    setValue('description', 'Completed the Monad builder workshop.', opts);
  };

  return (
    <div className="space-y-4">
    <Progress stage={stage} />
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="dc-sheet dc-paper space-y-5 p-6 sm:p-8" aria-label="Issue a credential">
      {!isAnchoringEnabled && (
        <div role="note" className="rounded border border-review bg-review-soft p-3 text-sm">
          <strong className="font-mono text-[11px] uppercase tracking-[0.12em]">Demo mode</strong>
          <p className="mt-1">No registry address is configured, so credentials made here are not anchored on Monad and will show as DEMO, never as verified.</p>
        </div>
      )}

      {needsAccount && (
        <section aria-label="Issuer account" className="rounded border border-review bg-review-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm">Sign in with a passkey to issue. Only accounts the registry owner has authorised can issue.</p>
            <PasskeyButton />
          </div>
        </section>
      )}
      {auth.authorized === false && (
        <p role="alert" className="rounded border border-review bg-review-soft p-3 text-sm">
          This account is not on the registry’s list of authorised issuers. The registry owner needs to add it.
        </p>
      )}

      <CopilotDraftPanel
        onUse={(draft) => {
          const opts = { shouldValidate: true, shouldDirty: true } as const;
          setValue('title', draft.title, opts);
          setValue('description', draft.description, opts);
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">Four details and you are done.</p>
        <button type="button" onClick={fillExample} className="text-sm font-semibold underline underline-offset-4">Use example details</button>
      </div>

      <Field id="title" label="Credential title" error={errors.title?.message}>
        <input id="title" className="input" placeholder="Certificate of Completion" autoComplete="off" aria-invalid={!!errors.title} {...register('title')} />
      </Field>
      <Field id="recipientName" label="Recipient name" error={errors.recipientName?.message}>
        <input id="recipientName" className="input" placeholder="Alex Chen" autoComplete="off" aria-invalid={!!errors.recipientName} {...register('recipientName')} />
      </Field>
      <Field id="holder" label="Recipient wallet address" error={errors.holder?.message} hint="The credential is bound to this address.">
        <input id="holder" className="input font-mono" placeholder="0x…" autoComplete="off" spellCheck={false} aria-invalid={!!errors.holder} {...register('holder')} />
      </Field>
      <Field id="description" label="Description (optional)" error={errors.description?.message} hint={`${descLen}/${DESCRIPTION_MAX}`}>
        <textarea id="description" rows={3} className="input h-auto" aria-invalid={!!errors.description} {...register('description')} />
      </Field>
      <Field id="expiryDate" label="Expiry date (optional)" error={errors.expiryDate?.message} hint="Leave empty for a credential that does not expire.">
        <input id="expiryDate" type="date" className="input" aria-invalid={!!errors.expiryDate} {...register('expiryDate')} />
      </Field>

      <p className="text-sm text-ink-soft">
        The title, recipient name and description travel inside the share link. Only a fingerprint of them is written on-chain, so avoid putting sensitive personal data in them.
      </p>

      {error && <p role="alert" className="rounded border border-stop bg-stop-soft p-3 text-sm text-stop">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn-primary" disabled={busy || blocked} aria-describedby={blocked ? 'issue-locked' : undefined}>
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Issue credential
        </button>
        {blocked && !busy && (
          <span id="issue-locked" className="text-sm text-ink-soft">
            {needsAccount ? 'Sign in with a passkey above to issue.' : 'Locked until this account is an authorised issuer.'}
          </span>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm font-semibold">
        {stage === 'confirming' && 'Issuing your credential… signed with your passkey, waiting for Monad to confirm.'}
      </p>
    </form>
    </div>
  );
}

const STEPS = ['Details', 'Confirm', 'Share'] as const;

/** Where you are in the flow. Words and numbers, not colour alone. */
function Progress({ stage }: { stage: Stage }) {
  const at = stage === 'wallet' || stage === 'confirming' ? 1 : stage === 'done' ? 2 : 0;
  return (
    <ol aria-label="Progress" className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={at === i ? 'step' : undefined} className="flex items-center gap-2">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[3px] border transition-colors duration-300 ${i <= at ? 'border-signal bg-signal-soft font-semibold' : 'border-line text-ink-soft'}`}>{i + 1}</span>
          <span className={i <= at ? 'text-ink' : 'text-ink-soft'}>{s}</span>
          {i < STEPS.length - 1 && <span aria-hidden="true" className={`h-px w-8 transition-colors duration-300 ${i < at ? 'bg-signal' : 'bg-line'}`} />}
        </li>
      ))}
    </ol>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
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

function IssuedResult({ id, payload, onReset }: { id: Hex; payload: SharePayload; onReset: () => void }) {
  const { assessment } = useCredentialStatus(id, payload);
  const status = payload.demo ? 'DEMO' : assessment?.status ?? 'PENDING';
  return (
    <div className="space-y-6">
      <div role="status" className="rounded border border-go bg-go-soft p-3 text-sm">
        <strong>{payload.demo ? 'Demo credential created.' : 'Credential issued.'}</strong>{' '}
        {payload.demo ? 'It was not sent to Monad.' : 'It is anchored on Monad testnet.'}
      </div>
      <CredentialCard
        title={payload.title}
        recipientName={payload.recipientName}
        issuer={shortenAddress(payload.issuer)}
        status={status}
        id={id}
        tx={payload.tx}
        issuedAt={fmtUnix(payload.issuedAt)}
        expiry={fmtExpiry(payload.expiry)}
      />
      <ShareBlock id={id} path={verifyPath(id, payload)} />
      <div className="flex flex-wrap gap-3">
        <Link href={receiptPath(id, payload)} className="btn-secondary">View receipt</Link>
        <Link href="/dashboard" className="btn-secondary">My credentials</Link>
        <button type="button" className="btn-secondary" onClick={onReset}>Issue another</button>
      </div>
    </div>
  );
}
