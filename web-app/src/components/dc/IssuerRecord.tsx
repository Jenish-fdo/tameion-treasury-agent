'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import { useAccount } from '@/components/account';
import { DEMO_ISSUER } from '@/lib/dc/credential';
import { envioEnabled, fetchIssuer, fetchRecentActivity } from '@/lib/dc/envio';
import { demoInsight, type ActivityItem, type IssuerRecord as Record_ } from '@/lib/dc/insight';
import { isAnchoringEnabled } from '@/lib/dc/registry';
import { loadIssued } from '@/lib/dc/store';
import { ActivityList } from './InsightPanel';
import { AccountButton } from './AccountButton';

const NO_ID = `0x${'0'.repeat(64)}` as Hex;

function demoRecord(issuer: Address): { record: Record_ | null; activity: ActivityItem[] } {
  const activity = loadIssued()
    .filter((e) => e.payload.issuer.toLowerCase() === issuer.toLowerCase())
    .slice(0, 6)
    .map((e): ActivityItem => ({ kind: 'ISSUED', credentialId: e.id, actor: e.payload.issuer, timestamp: e.payload.issuedAt }));
  return { record: demoInsight(NO_ID, issuer).issuer, activity };
}

/**
 * The issuer's own standing: activity-based reputation and recent registry events. Reputation and activity come from the Envio indexer; in demo mode they are this browser's
 * demo data and say so.
 */
export function IssuerRecord() {
  const { address } = useAccount();
  const issuer = address ?? (isAnchoringEnabled ? undefined : DEMO_ISSUER);
  const [demo, setDemo] = useState<ReturnType<typeof demoRecord> | null>(null);
  useEffect(() => {
    if (!isAnchoringEnabled && issuer) setDemo(demoRecord(issuer));
  }, [issuer]);

  const live = useQuery({
    queryKey: ['issuer-record', issuer?.toLowerCase()],
    queryFn: async () => ({ record: await fetchIssuer(issuer!), activity: await fetchRecentActivity(6) }),
    enabled: isAnchoringEnabled && envioEnabled && Boolean(issuer),
    retry: 1,
    refetchInterval: 20_000,
  });

  const data = isAnchoringEnabled ? live.data : demo;
  const source = !isAnchoringEnabled ? 'Demo data · this browser only' : envioEnabled ? 'Indexed by Envio HyperIndex' : 'Indexer not connected';

  return (
    <section aria-labelledby="issuer-record-heading" className="dc-sheet dc-paper mb-8 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="issuer-record-heading" className="dc-label">Your issuer record</h2>
        <span className={`evidence-tag ${!isAnchoringEnabled ? 'border-review bg-review-soft' : envioEnabled ? 'border-signal bg-signal-soft' : 'border-line'}`}>{source}</span>
      </div>

      {!issuer ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-sm text-ink-soft">Sign in to see your reputation score and recent activity on the registry. Sign-in is not available yet.</p>
          <AccountButton />
        </div>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-[auto_1.2fr]">
          <div>
            <p className="dc-label">Reputation score</p>
            {data?.record ? (
              <>
                <p className="mt-1 font-display text-4xl leading-none">{data.record.score}<span className="font-mono text-sm text-ink-soft"> / 100</span></p>
                <p className="mt-1 font-mono text-xs text-ink-soft">{data.record.issued} issued · {data.record.revoked} revoked · {data.record.checks} checked</p>
              </>
            ) : (
              <p className="mt-1 max-w-[14rem] text-sm text-ink-soft">
                {isAnchoringEnabled && !envioEnabled ? 'Needs the Envio indexer (NEXT_PUBLIC_ENVIO_URL).' : live.isPending && isAnchoringEnabled ? 'Reading…' : 'No activity yet. Issue a credential to start your record.'}
              </p>
            )}
          </div>
          <div>
            <p className="dc-label">{isAnchoringEnabled ? 'Recent activity on the registry' : 'Your recent activity'}</p>
            <ActivityList items={data?.activity ?? []} empty={isAnchoringEnabled && !envioEnabled ? 'Event history needs the Envio indexer.' : 'Nothing yet.'} />
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-ink-soft">The score is an activity signal built from on-chain events. It is not a judgement that an issuer can be trusted.</p>
    </section>
  );
}
