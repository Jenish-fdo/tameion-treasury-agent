'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CasePanel } from '@/components/evidence/CasePanel';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { CaseFileSkeleton, EmptyState, ErrorState } from '@/components/evidence/States';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { useCredential } from '@/hooks/useCredential';
import { CREDENTIAL_ID_PATTERN, credentialStatus, ERROR_COPY, type CredentialRecord } from '@/lib/api';
import { explorerAddressUrl, safeHttpsUrl } from '@/lib/chain';
import type { Tone } from '@/lib/verdict';

const iso = (sec: number, none: string) => (sec === 0 ? none : new Date(sec * 1000).toISOString().replace('.000Z', 'Z'));

const OUTCOME = {
  active: { label: 'VALID', tone: 'signal' as Tone, text: 'This credential exists on-chain, has not been revoked and has not expired.' },
  expired: { label: 'EXPIRED', tone: 'review' as Tone, text: 'This credential exists on-chain but its expiry time has passed.' },
  revoked: { label: 'REVOKED', tone: 'stop' as Tone, text: 'The issuer has revoked this credential. Do not rely on it.' },
};

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">{k}</dt>
      <dd className="break-all font-mono text-sm">{children}</dd>
    </div>
  );
}

function Address({ value }: { value: string }) {
  return <a href={explorerAddressUrl(value)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{value}</a>;
}

function Report({ c }: { c: CredentialRecord }) {
  const [copied, setCopied] = useState(false);
  const outcome = OUTCOME[credentialStatus(c)];
  const link = safeHttpsUrl(c.metadataUri);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <CasePanel title="Credential verification" tone={outcome.tone} label={<EvidenceLabel tone={outcome.tone}>{outcome.label}</EvidenceLabel>}>
        <p className="font-semibold">{outcome.text}</p>
        <p className="mt-1 text-sm text-ink-soft">A valid credential is one piece of evidence about who is behind an address. It does not by itself mean a payment is safe.</p>
        <dl className="mt-4 divide-y divide-line">
          <Row k="Credential ID">{c.credentialId}</Row>
          <Row k="Type">{c.credentialType ?? 'Not returned by the verification service'}</Row>
          <Row k="Issuer"><Address value={c.issuer} /></Row>
          <Row k="Subject"><Address value={c.subject} /></Row>
          <Row k="Issued">{iso(c.issuedAt, 'Unknown')}</Row>
          <Row k="Expires">{iso(c.expiresAt, 'No expiry')}</Row>
          <Row k="Metadata">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{link}</a>
            ) : c.metadataUri ? (
              <span>{c.metadataUri} <span className="text-ink-soft">(not opened: only https links are clickable)</span></span>
            ) : (
              'None recorded'
            )}
          </Row>
        </dl>
      </CasePanel>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={copy}>Copy verification link</button>
        <Link href="/payment-check" className="btn-signal">Check payment risk</Link>
        <span role="status" className="text-sm">{copied ? 'Link copied.' : ''}</span>
      </div>
    </div>
  );
}

export default function VerifyCredentialPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const valid = CREDENTIAL_ID_PATTERN.test(id);
  const query = useCredential(id);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="container max-w-3xl space-y-8 py-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Public record / no wallet needed</p>
            <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Verify a credential</h1>
          </div>

          <div aria-live="polite">
            {!valid && (
              <EmptyState tag="NOT FOUND" title="This is not a valid credential ID.">
                Credential IDs are 66 characters: 0x followed by 64 hexadecimal digits.
              </EmptyState>
            )}
            {valid && query.isPending && (
              <div className="space-y-3">
                <p role="status" className="text-sm font-semibold">Looking up this credential…</p>
                <CaseFileSkeleton title="Credential verification" rows={5} />
              </div>
            )}
            {valid && query.isError && query.error.kind === 'not_found' && (
              <EmptyState tag="NOT FOUND" title="No credential with this ID exists.">
                <span className="break-all font-mono text-xs">{id}</span>
              </EmptyState>
            )}
            {valid && query.isError && query.error.kind !== 'not_found' && (
              <ErrorState title={ERROR_COPY[query.error.kind].title} message={ERROR_COPY[query.error.kind].message} />
            )}
            {valid && query.data && <Report c={query.data} />}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
