'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { BUSINESS_ID, useBusinessId } from '@/hooks/useBusinessId';
import { EXPLORER_URL } from '@/lib/chain';
import { baseUnitsToUsdc, errorText, riskLabel, treasuryFetch, type DecisionView, type Page } from '@/lib/treasury';
import { shortenAddress } from '@/lib/utils';
import { BusinessPicker } from './BusinessPicker';
import { TestnetBanner } from './TestnetBanner';

const PAGE_SIZE = 20;
const fmtTime = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

function Integrity({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-go"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> hash verified</span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-stop"><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> hash mismatch</span>
  );
}

function PendingApprovals({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['pending', businessId],
    queryFn: () => treasuryFetch<{ items: DecisionView[]; scanned: number; totalRecords: number }>(`approvals/pending?businessId=${businessId}`),
    retry: 1,
    refetchInterval: 20_000,
  });
  return (
    <section aria-labelledby="pending-heading" className="dc-sheet dc-paper p-5">
      <h2 id="pending-heading" className="font-display text-2xl">Pending approvals</h2>
      <p className="mt-1 text-sm text-ink-soft">Payments the agent escalated to a human that nobody has resolved yet. Approving is not available in this build: it needs a signing wallet.</p>
      {q.isPending ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading…</p>
      ) : q.isError ? (
        <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-3 text-sm">{errorText(q.error)}</p>
      ) : q.data.items.length === 0 ? (
        <p className="mt-3 text-sm">Nothing is waiting for you.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {q.data.items.map((d) => (
            <li key={d.decisionId} className="rounded border border-review bg-review-soft p-3 text-sm">
              <p><strong>{baseUnitsToUsdc(d.amount)} USDC</strong> to <span className="font-mono text-xs">{d.counterparty ?? 'unknown recipient'}</span></p>
              <p className="mt-1 text-xs text-ink-soft">
                Escalated {fmtTime(d.timestamp)} · risk {riskLabel(d.riskTier)} ({d.riskScore / 100}%) · approval reference <span className="font-mono">{d.approvalRef ? shortenAddress(d.approvalRef, 6) : 'none'}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {q.data && q.data.totalRecords > q.data.scanned && (
        <p className="mt-3 text-xs text-ink-soft">Only the newest {q.data.scanned} of {q.data.totalRecords} records were checked.</p>
      )}
    </section>
  );
}

function DecisionLog({ businessId }: { businessId: string }) {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ['decisions', businessId, page],
    queryFn: () => treasuryFetch<Page<DecisionView>>(`decisions?businessId=${businessId}&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`),
    retry: 1,
    placeholderData: (prev) => prev,
  });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-labelledby="log-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="log-heading" className="font-display text-2xl">Decision log</h2>
        {q.data && <p className="font-mono text-xs text-ink-soft">{total} record{total === 1 ? '' : 's'} · page {page + 1} of {pages}</p>}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Append-only: records are never edited or removed. The log shows who recorded what and when. It does not prove that a transfer happened; check the transaction on the explorer.
      </p>
      {q.isPending ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading the log…</p>
      ) : q.isError ? (
        <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-3 text-sm">{errorText(q.error)}</p>
      ) : q.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No decisions recorded for this business yet.</p>
      ) : (
        <>
          {q.data.linked === false && (
            <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-3 text-sm">The hash chain on this page does not link up. Treat these records as unreliable until it is explained.</p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <caption className="sr-only">Treasury decisions, newest first</caption>
              <thead>
                <tr className="border-b border-line">
                  {['#', 'When', 'Action', 'Outcome', 'Counterparty', 'Amount', 'Risk', 'Transaction', 'Integrity'].map((h) => <th key={h} scope="col" className="dc-label py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...q.data.items].reverse().map((d) => (
                  <tr key={d.decisionId} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-mono text-xs">{d.seq}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{fmtTime(d.timestamp)}</td>
                    <td className="py-2 pr-3 capitalize">{label(d.action)}</td>
                    <td className="py-2 pr-3 capitalize">{label(d.outcome)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{d.counterparty ? shortenAddress(d.counterparty) : '—'}</td>
                    <td className="py-2 pr-3">{baseUnitsToUsdc(d.amount)}</td>
                    <td className="py-2 pr-3">{riskLabel(d.riskTier)} · {d.riskScore / 100}%</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {d.txHash ? <a className="underline underline-offset-4" href={`${EXPLORER_URL}/tx/${d.txHash}`} target="_blank" rel="noopener noreferrer">{shortenAddress(d.txHash, 6)}<span className="sr-only"> (opens the Arc explorer in a new tab)</span></a> : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs"><Integrity ok={d.hashVerified} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Older</button>
            <button type="button" className="btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Newer</button>
            <span className="text-xs text-ink-soft">Records are in the order they were written.</span>
          </div>
        </>
      )}
    </section>
  );
}

/** Founder: pending approvals and the decision log. Read-only. */
export function DecisionsView() {
  const { businessId, setBusinessId, ready } = useBusinessId();
  return (
    <div className="container max-w-5xl space-y-6 py-10 sm:py-14">
      <div>
        <p className="dc-label">Founder</p>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Decisions and approvals</h1>
      </div>
      <TestnetBanner />
      {ready && <BusinessPicker businessId={businessId} onChange={setBusinessId} />}
      {BUSINESS_ID.test(businessId) && (
        <>
          <PendingApprovals businessId={businessId} />
          <DecisionLog businessId={businessId} />
        </>
      )}
    </div>
  );
}
