'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/evidence/States';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { credentialStatus, type CredentialRecord, type CredentialStatus } from '@/lib/api';
import { cn, shortenAddress } from '@/lib/utils';
import { CredentialDetail, STATUS_LABEL } from './CredentialDetail';

type Filter = 'all' | CredentialStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'revoked', label: 'Revoked' },
];
const day = (sec: number) => (sec === 0 ? 'No expiry' : new Date(sec * 1000).toISOString().slice(0, 10));

export function CredentialTable({ credentials }: { credentials: CredentialRecord[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<CredentialRecord | null>(null);
  const rows = credentials.filter((c) => filter === 'all' || credentialStatus(c) === filter);

  if (credentials.length === 0) {
    return (
      <EmptyState tag="NO CREDENTIALS" title="No credentials have been issued to this address through Credentia.">
        This list shows credentials issued through the Credentia API that are currently valid on-chain.
      </EmptyState>
    );
  }

  return (
    <div>
      <div role="group" aria-label="Filter credentials by status" className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn('rounded border px-3 py-1 font-mono text-xs uppercase tracking-[0.12em]', filter === f.id ? 'border-signal border-b-2 bg-signal-soft' : 'border-line bg-sheet hover:border-ink')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState tag="NO MATCH" title={`No ${filter} credentials.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Credentials issued to this address</caption>
            <thead className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              <tr><th className="py-2 pr-4">ID</th><th className="pr-4">Type</th><th className="pr-4">Issuer</th><th className="pr-4">Issued</th><th className="pr-4">Expires</th><th>Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const st = STATUS_LABEL[credentialStatus(c)];
                return (
                  <tr key={c.credentialId}>
                    <td className="py-2 pr-4">
                      <button type="button" className="font-mono underline underline-offset-4" onClick={() => setOpen(c)} aria-label={`Open credential ${shortenAddress(c.credentialId, 6)}`}>
                        {shortenAddress(c.credentialId, 6)}
                      </button>
                    </td>
                    <td className="pr-4">{c.credentialType ?? 'Not recorded'}</td>
                    <td className="pr-4 font-mono">{shortenAddress(c.issuer)}</td>
                    <td className="pr-4 font-mono">{day(c.issuedAt)}</td>
                    <td className="pr-4 font-mono">{day(c.expiresAt)}</td>
                    <td><EvidenceLabel tone={st.tone}>{st.text}</EvidenceLabel></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <CredentialDetail credential={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
