'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { assess, receiptPath, verifyPath, type Assessment, type CredentialStatus } from '@/lib/dc/credential';
import { fmtExpiry, fmtUnix } from '@/lib/dc/format';
import { isAnchoringEnabled, readCredential } from '@/lib/dc/registry';
import { loadIssued, type IssuedEntry } from '@/lib/dc/store';
import { useOrigin } from '@/hooks/useOrigin';
import { cn } from '@/lib/utils';
import { CopyLinkButton } from './ShareBlock';
import { StatusBadge } from './StatusBadge';

const FILTERS = ['ALL', 'PENDING', 'VERIFIED', 'REVOKED', 'EXPIRED'] as const;
type Filter = (typeof FILTERS)[number];
const PENDING_WINDOW_SEC = 10 * 60;

/** Issuer-side view: a just-issued credential the registry cannot show yet is PENDING rather than "not found". */
export function dashboardStatus(entry: IssuedEntry, a: Assessment, nowSec: number): CredentialStatus {
  if (a.status === 'NOT_FOUND' && entry.payload.tx && nowSec - entry.payload.issuedAt < PENDING_WINDOW_SEC) return 'PENDING';
  return a.status;
}

export function DashboardView() {
  const [entries, setEntries] = useState<IssuedEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const origin = useOrigin();

  useEffect(() => setEntries(loadIssued()), []);

  const results = useQueries({
    queries: (entries ?? []).map((e) => ({
      queryKey: ['credential-chain', e.id],
      queryFn: () => readCredential(e.id),
      enabled: isAnchoringEnabled && !e.payload.demo,
      retry: 1,
      staleTime: 15_000,
    })),
  });

  const rows = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return (entries ?? []).map((entry, i) => {
      const r = results[i];
      const loading = !entry.payload.demo && isAnchoringEnabled && r?.isPending;
      const chain = r?.isError ? undefined : r?.data;
      const a = assess(entry.payload, entry.id, loading ? undefined : chain, now);
      return { entry, loading: Boolean(loading), status: dashboardStatus(entry, a, now) };
    });
  }, [entries, results]);

  if (entries === null) return <Skeletons />;

  const shown = rows.filter((r) => filter === 'ALL' || r.status === filter);
  const count = (f: Filter) => (f === 'ALL' ? rows.length : rows.filter((r) => r.status === f).length);

  return (
    <div>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn('rounded-[3px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em]', filter === f ? 'border-signal border-2 bg-signal-soft font-semibold' : 'border-line bg-sheet hover:border-ink')}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} <span className="ml-1 text-ink-soft">{count(f)}</span>
          </button>
        ))}
      </div>

      {!isAnchoringEnabled && entries.length > 0 && (
        <p role="note" className="mt-4 rounded border border-review bg-review-soft p-3 text-sm">Demo mode: no registry is configured, so these credentials are not anchored on Monad.</p>
      )}

      <ul className="mt-6 grid gap-5 sm:grid-cols-2" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
        {shown.map(({ entry, loading, status }) => {
          const path = verifyPath(entry.id, entry.payload);
          return (
            <motion.li
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="dc-sheet dc-paper p-5 transition-shadow duration-300 hover:shadow-[8px_8px_0_rgba(16,26,43,0.12)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-2xl leading-tight">{entry.payload.title}</h2>
                {loading ? <span className="dc-label" role="status">Checking…</span> : <StatusBadge status={status} />}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><dt className="dc-label">Recipient</dt><dd className="mt-0.5 font-semibold">{entry.payload.recipientName}</dd></div>
                <div><dt className="dc-label">Issued</dt><dd className="mt-0.5 font-mono text-xs">{fmtUnix(entry.payload.issuedAt)}</dd></div>
                <div><dt className="dc-label">Expires</dt><dd className="mt-0.5 font-mono text-xs">{fmtExpiry(entry.payload.expiry)}</dd></div>
              </dl>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <Link href={path} className="btn-secondary">Verification page</Link>
                  <CopyLinkButton path={path} />
                  <Link href={receiptPath(entry.id, entry.payload)} className="btn-secondary">View receipt</Link>
                </div>
                <div className="shrink-0 border border-line bg-white p-1.5" role="img" aria-label={`QR code for ${entry.payload.title}`}>
                  {origin ? <QRCodeSVG value={`${origin}${path}`} size={84} level="M" marginSize={0} /> : <div className="h-[84px] w-[84px]" />}
                </div>
              </div>
            </motion.li>
          );
        })}
        </AnimatePresence>
      </ul>

      {entries.length === 0 && (
        <div className="dc-sheet dc-paper mt-6 p-8 text-center">
          <p className="dc-label">Empty</p>
          <p className="mt-2 font-display text-3xl">No credentials issued yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">Credentials you issue from this browser appear here.</p>
          <Link href="/issue" className="btn-primary mt-5">Issue a credential</Link>
        </div>
      )}
      {entries.length > 0 && shown.length === 0 && (
        <p className="mt-6 rounded border border-line bg-sheet p-4 text-sm">No {filter.toLowerCase()} credentials.</p>
      )}
      {entries.length > 0 && (
        <p className="mt-8 text-xs text-ink-soft">This list is stored in this browser only. Your credentials stay valid on the registry and through their links even if you clear it.</p>
      )}
    </div>
  );
}

function Skeletons() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2" aria-label="Loading credentials" aria-busy="true">
      {[0, 1].map((i) => (
        <li key={i} className="dc-sheet dc-paper animate-pulse p-5 motion-reduce:animate-none">
          <div className="h-6 w-2/3 bg-paper-deep" /><div className="mt-5 h-4 w-1/2 bg-paper-deep" /><div className="mt-3 h-4 w-1/3 bg-paper-deep" /><div className="mt-6 h-9 w-full bg-paper-deep" />
        </li>
      ))}
    </ul>
  );
}
