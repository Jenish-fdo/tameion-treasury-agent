'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useCredentialStatus } from '@/hooks/useCredentialStatus';
import { useInsight } from '@/hooks/useInsight';
import { decodePayload, isCredentialId, verifyPath } from '@/lib/dc/credential';
import { ARC_CHAIN_ID, ARC_NETWORK_NAME } from '@/lib/arc';
import { fmtExpiry, fmtUnix } from '@/lib/dc/format';
import { explorerLinkFor } from './VerifyView';
import { CopyLinkButton } from './ShareBlock';
import { StatusBadge } from './StatusBadge';
import { ActivityList } from './InsightPanel';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="dc-label">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export function ReceiptView({ id, d }: { id: string; d?: string }) {
  const payload = useMemo(() => decodePayload(d), [d]);
  const validId = isCredentialId(id);
  const { isLoading, chain, assessment } = useCredentialStatus((validId ? id : '0x') as `0x${string}`, payload);

  const issuerWallet = chain?.issuer ?? payload?.issuer;
  const { insight } = useInsight((validId ? id : '0x') as `0x${string}`, issuerWallet, Boolean(payload?.demo));

  if (!validId) {
    return <div role="alert" className="container max-w-3xl py-14"><h1 className="font-display text-3xl">This is not a valid credential ID.</h1></div>;
  }
  if (isLoading) {
    return <p role="status" className="container flex max-w-3xl items-center gap-2 py-14 font-semibold"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading receipt…</p>;
  }

  const status = assessment?.status ?? 'UNAVAILABLE';
  const explorer = explorerLinkFor(payload?.tx);
  const issuedSec = chain?.issuedAt ?? payload?.issuedAt ?? 0;

  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <p className="dc-label">Credential receipt</p>
      <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">{payload?.title ?? 'Credential'}</h1>

      <section aria-label="Receipt details" className="dc-sheet dc-paper mt-6 p-6 sm:p-8">
        <dl>
          <Row label="Status"><StatusBadge status={status} /> <span className="ml-2 text-ink-soft">{assessment?.detail}</span></Row>
          <Row label="Credential ID"><span className="font-mono text-xs">{id}</span></Row>
          <Row label="Title">{payload?.title ?? <span className="text-ink-soft">Not included in this link</span>}</Row>
          <Row label="Recipient">{payload?.recipientName ?? <span className="text-ink-soft">Not included in this link</span>}</Row>
          <Row label="Issuer"><span className="font-mono text-xs">{chain?.issuer ?? payload?.issuer ?? 'Unknown'}</span></Row>
          <Row label="Recipient wallet"><span className="font-mono text-xs">{chain?.holder ?? payload?.holder ?? 'Unknown'}</span></Row>
          <Row label="Issued"><span className="font-mono text-xs">{issuedSec ? fmtUnix(issuedSec) : 'Unknown'}</span></Row>
          <Row label="Expires"><span className="font-mono text-xs">{fmtExpiry(chain?.expiryTimestamp ?? payload?.expiry ?? 0)}</span></Row>
          <Row label="Verifications recorded"><span className="font-mono text-xs">{insight ? insight.verificationCount : 'Not available'}</span></Row>
          <Row label="Network"><span className="font-mono text-xs">{ARC_NETWORK_NAME.toUpperCase()} ({ARC_CHAIN_ID})</span></Row>
          <Row label="Transaction hash"><span className="font-mono text-xs">{payload?.tx ?? 'Not available'}</span></Row>
          <Row label="Explorer">
            {explorer ? <a href={explorer} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Open on the Arc explorer<span className="sr-only"> (new tab)</span></a> : <span className="text-ink-soft">None: this credential was not anchored on-chain.</span>}
          </Row>
        </dl>
      </section>

      {insight && (
        <section aria-label="Verification receipts" className="dc-sheet mt-6 bg-sheet p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="dc-label">Verification receipts</h2>
            <span className={`evidence-tag ${insight.source === 'envio' ? 'border-signal bg-signal-soft' : insight.source === 'demo' ? 'border-review bg-review-soft' : 'border-line'}`}>
              {insight.source === 'envio' ? 'Indexed by Envio HyperIndex' : insight.source === 'demo' ? 'Demo data · this browser only' : 'Read from the registry'}
            </span>
          </div>
          <ActivityList
            items={insight.history.filter((a) => a.kind === 'CHECKED')}
            empty={
              insight.source === 'chain' && insight.verificationCount > 0
                ? `${insight.verificationCount} recorded on the registry. Listing each one needs the Envio indexer.`
                : 'No one has recorded a verification of this credential yet. Anyone can, from its verification page.'
            }
          />
        </section>
      )}

      <p className="mt-4 text-sm text-ink-soft">
        Credentia Treasury Autopsy is an early build on testnet. This receipt is not a legal document and does not guarantee the credential’s security or the issuer’s trustworthiness.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={verifyPath(id, payload ?? undefined)} className="btn-primary">Open verification page</Link>
        <CopyLinkButton path={verifyPath(id, payload ?? undefined)} />
        <Link href="/dashboard" className="btn-secondary">My credentials</Link>
      </div>
    </div>
  );
}
