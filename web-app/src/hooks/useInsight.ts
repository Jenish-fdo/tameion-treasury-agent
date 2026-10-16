'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import { envioEnabled, fetchInsight } from '@/lib/dc/envio';
import { demoInsight, type CredentialInsight } from '@/lib/dc/insight';
import { isAnchoringEnabled, readCredentialExtras } from '@/lib/dc/registry';

export interface InsightResult {
  isLoading: boolean;
  insight: CredentialInsight | null;
  /** Re-read after recording a verification. */
  refresh: () => void;
}

/**
 * The on-chain record around a credential: verification count, history and the issuer's record.
 * Envio HyperIndex when configured; otherwise direct contract reads (counts only); demo data in demo mode.
 */
export function useInsight(id: Hex, issuer: Address | undefined, demo: boolean): InsightResult {
  const local = demo || !isAnchoringEnabled;
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ['insight', id, issuer?.toLowerCase(), envioEnabled],
    queryFn: async (): Promise<CredentialInsight> => {
      if (envioEnabled) return fetchInsight(id, issuer);
      const extras = await readCredentialExtras(id);
      return { source: 'chain', verificationCount: extras.verificationCount, highAssurance: extras.highAssurance, history: [], issuer: null };
    },
    enabled: !local,
    retry: 1,
    staleTime: 10_000,
    refetchInterval: envioEnabled ? 15_000 : false,
  });

  if (local) {
    void tick;
    return { isLoading: !mounted, insight: mounted ? demoInsight(id, issuer) : null, refresh: () => setTick((t) => t + 1) };
  }
  return { isLoading: q.isPending, insight: q.data ?? null, refresh: () => void q.refetch() };
}
