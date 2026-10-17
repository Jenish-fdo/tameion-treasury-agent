'use client';

import { ExternalLink } from 'lucide-react';
import { EXPLORER_URL } from '@/lib/chain';
import type { CredentialStatus } from '@/lib/dc/credential';
import { fmtUnix } from '@/lib/dc/format';
import { ACTIVITY_LABEL, type ActivityItem, type CredentialInsight } from '@/lib/dc/insight';
import { reputationParts } from '@/lib/dc/reputation';
import { shortenAddress } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

const SOURCE: Record<CredentialInsight['source'], string> = {
  envio: 'Indexed by Envio HyperIndex',
  chain: 'Read from the registry',
  demo: 'Demo data · this browser only',
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const label = item.kind === 'CHECKED' && item.valid !== undefined ? `${ACTIVITY_LABEL.CHECKED}: ${item.valid ? 'valid' : 'not valid'}` : ACTIVITY_LABEL[item.kind];
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="font-mono text-xs text-ink-soft">
        {item.actor.length === 42 && `${shortenAddress(item.actor)} · `}
        {fmtUnix(item.timestamp)}
        {item.txHash && (
          <a href={`${EXPLORER_URL}/tx/${item.txHash}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 underline underline-offset-4">
            tx <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens the Arc explorer in a new tab)</span>
          </a>
        )}
      </span>
    </li>
  );
}

/** Small list of recent registry events. Used on the dashboard and inside the insight panel. */
export function ActivityList({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-ink-soft">{empty}</p>;
  return (
    <ol className="mt-1 divide-y divide-line">
      {items.map((item, i) => (
        <ActivityRow key={`${item.kind}-${item.timestamp}-${item.txHash ?? i}`} item={item} />
      ))}
    </ol>
  );
}

/**
 * The on-chain record around a credential: its status, how often it has been checked, the issuer's
 * activity-based reputation and the event history. Says where the numbers came from.
 */
export function InsightPanel({ status, insight, isLoading }: { status: CredentialStatus; insight: CredentialInsight | null; isLoading: boolean }) {
  if (isLoading || !insight) {
    return (
      <section aria-label="On-chain record" aria-busy="true" className="dc-sheet bg-sheet p-5">
        <p className="dc-label">On-chain record</p>
        <div className="mt-4 grid animate-pulse gap-4 motion-reduce:animate-none sm:grid-cols-3" aria-hidden="true">
          <div className="h-12 bg-paper-deep" /><div className="h-12 bg-paper-deep" /><div className="h-12 bg-paper-deep" />
        </div>
        <p role="status" className="sr-only">Reading the on-chain record…</p>
      </section>
    );
  }

  const { issuer } = insight;
  return (
    <section aria-labelledby="insight-heading" className="dc-sheet bg-sheet p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="insight-heading" className="dc-label">On-chain record</h2>
        <span className={`evidence-tag ${insight.source === 'envio' ? 'border-signal bg-signal-soft' : insight.source === 'demo' ? 'border-review bg-review-soft' : 'border-line'}`}>
          {SOURCE[insight.source]}
        </span>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="dc-label">Credential status</dt>
          <dd className="mt-1.5"><StatusBadge status={status} /></dd>
        </div>
        <div>
          <dt className="dc-label">Verifications recorded</dt>
          <dd className="mt-1 font-display text-3xl leading-none">{insight.verificationCount}</dd>
        </div>
        <div>
          <dt className="dc-label">Issuer reputation</dt>
          <dd className="mt-1 font-display text-3xl leading-none">
            {issuer ? <>{issuer.score}<span className="font-mono text-sm text-ink-soft"> / 100</span></> : <span className="font-body text-sm text-ink-soft">Needs the indexer</span>}
          </dd>
        </div>
      </dl>

      {issuer && (
        <details className="mt-4 rounded border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">How the reputation score is worked out</summary>
          <ul className="mt-3 space-y-1.5">
            {reputationParts(issuer).map((p) => (
              <li key={p.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{p.label}</span>
                <span className="font-mono text-xs">{p.points} / {p.max}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">
            {issuer.issued} issued · {issuer.revoked} revoked · {issuer.checks} verification{issuer.checks === 1 ? '' : 's'} recorded. This is an activity signal built from on-chain events, not a
            judgement that the issuer is trustworthy.
          </p>
        </details>
      )}

      <div className="mt-4">
        <h3 className="dc-label">Recent activity</h3>
        <ActivityList
          items={insight.history.slice(0, 6)}
          empty={insight.source === 'chain' ? 'Event history needs the Envio indexer (NEXT_PUBLIC_ENVIO_URL). Counts above are read straight from the registry.' : 'Nothing recorded yet.'}
        />
      </div>
    </section>
  );
}
