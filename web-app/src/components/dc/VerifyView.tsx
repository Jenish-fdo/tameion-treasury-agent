'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useCredentialStatus } from '@/hooks/useCredentialStatus';
import { useCvi } from '@/hooks/useCvi';
import { useInsight } from '@/hooks/useInsight';
import { buildCopilotContext } from '@/lib/dc/copilot-context';
import { EXPLORER_URL, explorerAddressUrl } from '@/lib/chain';
import { decodePayload, isCredentialId, receiptPath, verifyPath, type CredentialStatus } from '@/lib/dc/credential';
import { fmtExpiry, fmtUnix } from '@/lib/dc/format';
import { registryAddress } from '@/lib/dc/registry';
import { shortenAddress } from '@/lib/utils';
import { CredentialCard } from './CredentialCard';
import { CopyLinkButton } from './ShareBlock';
import { StatusSwap } from './motion';
import { StatusBadge } from './StatusBadge';
import { CheckList } from './CheckList';
import { CopilotAskPanel } from './Copilot';
import { CviLine } from './CviBadge';
import { InsightPanel } from './InsightPanel';
import { RecordCheck } from './RecordCheck';
import { checksFor } from '@/lib/dc/checks';

export function explorerLinkFor(tx?: string): string | null {
  if (tx) return `${EXPLORER_URL}/tx/${tx}`;
  if (registryAddress) return explorerAddressUrl(registryAddress);
  return null;
}

const TONE: Partial<Record<CredentialStatus, string>> = {
  VERIFIED: 'border-go bg-go-soft',
  REVOKED: 'border-stop bg-stop-soft',
  NOT_FOUND: 'border-stop bg-stop-soft',
  MISMATCH: 'border-stop bg-stop-soft',
  EXPIRED: 'border-review bg-review-soft',
  DEMO: 'border-review bg-review-soft',
};

/** Public verification page body. Needs no wallet. `d` is the untrusted share payload from the link. */
export function VerifyView({ id, d }: { id: string; d?: string }) {
  const payload = useMemo(() => decodePayload(d), [d]);
  const validId = isCredentialId(id);
  const { isLoading, chain, assessment } = useCredentialStatus((validId ? id : '0x') as `0x${string}`, payload);
  const issuerWallet = chain?.issuer ?? payload?.issuer;
  const cvi = useCvi(validId ? issuerWallet : undefined);
  const insightQ = useInsight((validId ? id : '0x') as `0x${string}`, issuerWallet, Boolean(payload?.demo));
  const dialogRef = useRef<HTMLDialogElement>(null);

  const verified = assessment?.status === 'VERIFIED';
  useEffect(() => {
    const dlg = dialogRef.current;
    if (verified && dlg && typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
  }, [verified]);

  if (!validId) {
    return (
      <Wrap>
        <div role="alert" className="dc-sheet bg-stop-soft p-6">
          <p className="dc-label text-stop">Invalid link</p>
          <h1 className="mt-2 font-display text-3xl">This is not a valid credential ID.</h1>
          <p className="mt-2 text-ink-soft">A credential ID is 66 characters starting with 0x. Check that the whole link was copied.</p>
        </div>
      </Wrap>
    );
  }

  if (isLoading) {
    return (
      <Wrap>
        <p role="status" className="flex items-center gap-2 font-semibold">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Verifying on Monad…
        </p>
        <div className="dc-sheet dc-paper mt-4 animate-pulse p-8 motion-reduce:animate-none" aria-hidden="true">
          <div className="h-3 w-40 bg-paper-deep" /><div className="mt-8 h-9 w-3/4 bg-paper-deep" /><div className="mt-8 h-2 w-full bg-paper-deep" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="h-10 bg-paper-deep" /><div className="h-10 bg-paper-deep" /></div>
        </div>
      </Wrap>
    );
  }

  const status = assessment?.status ?? 'UNAVAILABLE';
  const checks = assessment ? checksFor(assessment, Boolean(payload)) : [];
  // There is something to inspect when the registry has the credential, or it is a demo credential.
  const canInspect = Boolean(chain) || status === 'DEMO';
  const tx = payload?.tx;
  const explorer = explorerLinkFor(tx);
  const path = verifyPath(id, payload ?? undefined);
  const issuedSec = chain?.issuedAt ?? payload?.issuedAt ?? 0;
  const expirySec = chain?.expiryTimestamp ?? payload?.expiry ?? 0;

  return (
    <Wrap>
      <p className="dc-label">Verification</p>
      <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Credential check</h1>

      {d && !payload && (
        <p role="alert" className="mt-4 rounded border border-review bg-review-soft p-3 text-sm">
          The details in this link are damaged and were ignored. Only on-chain data is shown below.
        </p>
      )}

      <div role="status" aria-live="polite" className={`mt-6 rounded border-l-4 border p-4 ${TONE[status] ?? 'border-line bg-paper-deep'}`}>
        <StatusSwap statusKey={status}>
          <StatusBadge status={status} />
        </StatusSwap>
        <p className="mt-2 text-sm">{assessment?.detail}</p>
      </div>

      {assessment && <div className="mt-6"><CheckList checks={checks} /></div>}

      {issuerWallet && (
        <section aria-label="Issuer verification" className="dc-sheet mt-6 bg-sheet p-5">
          <h2 className="dc-label">Who issued this</h2>
          <p className="mt-2 break-all font-mono text-xs">{issuerWallet}</p>
          <div className="mt-3">
            {cvi.status ? <CviLine status={cvi.status} who="Cleanverse identity (testnet stand-in)" /> : <p role="status" className="text-sm text-ink-soft">Checking the issuer’s CVI verification (demo stand-in)…</p>}
          </div>
        </section>
      )}

      {canInspect && <div className="mt-6"><InsightPanel status={status} insight={insightQ.insight} isLoading={insightQ.isLoading} /></div>}

      <div className="mt-6">
        {payload ? (
          <CredentialCard
            title={payload.title}
            recipientName={payload.recipientName}
            issuer={shortenAddress(payload.issuer)}
            status={status}
            id={id}
            tx={tx}
            issuedAt={fmtUnix(issuedSec)}
            expiry={fmtExpiry(expirySec)}
          />
        ) : chain ? (
          <div className="dc-sheet dc-paper p-6">
            <p className="dc-label">On-chain record</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt className="dc-label">Issuer</dt><dd className="mt-1 break-all font-mono text-xs">{chain.issuer}</dd></div>
              <div><dt className="dc-label">Holder</dt><dd className="mt-1 break-all font-mono text-xs">{chain.holder}</dd></div>
              <div><dt className="dc-label">Issued</dt><dd className="mt-1 font-mono text-xs">{fmtUnix(chain.issuedAt)}</dd></div>
              <div><dt className="dc-label">Expires</dt><dd className="mt-1 font-mono text-xs">{fmtExpiry(chain.expiryTimestamp)}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-ink-soft">This link carries no title or recipient name, so only the on-chain facts can be shown.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {explorer ? (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="btn-primary">
            Verify on Monad <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only"> (opens the Monad explorer in a new tab)</span>
          </a>
        ) : (
          <span className="btn-primary pointer-events-none opacity-45" aria-disabled="true">Verify on Monad (not anchored)</span>
        )}
        <CopyLinkButton path={path} />
        <Link href={receiptPath(id, payload ?? undefined)} className="btn-secondary">View receipt</Link>
      </div>

      {canInspect && (
        <div className="mt-6">
          <RecordCheck id={id as `0x${string}`} demo={status === 'DEMO'} receiptHref={receiptPath(id, payload ?? undefined)} onRecorded={insightQ.refresh} />
        </div>
      )}

      {assessment && (
        <div className="mt-6">
          <CopilotAskPanel context={buildCopilotContext({ id, payload, chain, assessment, checks, cvi: cvi.status, insight: insightQ.insight })} />
        </div>
      )}

      {verified && (
        <dialog ref={dialogRef} aria-labelledby="verified-title" className="w-[min(92vw,30rem)] rounded-md border border-go bg-sheet p-0 text-ink shadow-sheet backdrop:bg-ink/40">
          <div className="p-6">
            <StatusBadge status="VERIFIED" />
            <h2 id="verified-title" className="mt-3 font-display text-3xl">Credential verified</h2>
            <dl className="mt-4 space-y-3">
              <div><dt className="dc-label">Credential ID</dt><dd className="mt-1 break-all font-mono text-xs">{id}</dd></div>
              <div><dt className="dc-label">Transaction hash</dt><dd className="mt-1 break-all font-mono text-xs">{tx ?? 'Not included in this link'}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={receiptPath(id, payload ?? undefined)} className="btn-primary">View receipt</Link>
              <CopyLinkButton path={path} />
              <form method="dialog"><button className="btn-secondary">Close</button></form>
            </div>
          </div>
        </dialog>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="container max-w-3xl py-10 sm:py-14">{children}</div>;
}
