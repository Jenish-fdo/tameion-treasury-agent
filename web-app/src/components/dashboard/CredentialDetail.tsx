'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { credentialStatus, type CredentialRecord, type CredentialStatus } from '@/lib/api';
import type { Tone } from '@/lib/verdict';

export const STATUS_LABEL: Record<CredentialStatus, { text: string; tone: Tone }> = {
  active: { text: 'ACTIVE', tone: 'signal' },
  expired: { text: 'EXPIRED', tone: 'review' },
  revoked: { text: 'REVOKED', tone: 'stop' },
};

/** Modal detail panel. Escape or the backdrop closes it; focus moves to the close button on open. */
export function CredentialDetail({ credential: c, onClose }: { credential: CredentialRecord; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const st = STATUS_LABEL[credentialStatus(c)];
  const rows: [string, string][] = [
    ['Credential ID', c.credentialId], ['Type', c.credentialType ?? 'Not recorded'], ['Issuer', c.issuer], ['Subject', c.subject],
    ['Issued', c.issuedAt ? new Date(c.issuedAt * 1000).toISOString() : 'Unknown'],
    ['Expires', c.expiresAt ? new Date(c.expiresAt * 1000).toISOString() : 'No expiry'],
  ];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cred-detail-title" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-md border border-line border-t-2 border-t-signal bg-sheet p-5 shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="cred-detail-title" className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">Credential detail</h2>
          <EvidenceLabel tone={st.tone}>{st.text}</EvidenceLabel>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">{k}</dt><dd className="break-all font-mono">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-ink-soft">A valid credential is one piece of evidence. It does not by itself mean a payment is safe.</p>
        <div className="mt-5 flex gap-3">
          <Link href={`/credential/verify/${c.credentialId}`} className="btn-signal">Open verification page</Link>
          <button ref={closeRef} type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
