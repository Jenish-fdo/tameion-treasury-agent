'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { CVI_UNKNOWN, cviFromChain, demoCvi, setDemoCvi, type CviStatus } from '@/lib/dc/cvi';
import { isAnchoringEnabled, readCvi, readIssuerAuthorized } from '@/lib/dc/registry';

export interface CviResult {
  isLoading: boolean;
  /** null while there is no wallet to ask about. */
  status: CviStatus | null;
  /** Owner authorisation on the registry; undefined in demo mode or while loading. */
  authorized: boolean | undefined;
  /** Demo mode only: flip the simulated verification for this wallet. */
  simulate?: (verified: boolean) => void;
}

/** A wallet's Cleanverse CVI status (testnet demo stand-in): from the registry's verifier when anchored, simulated (and labelled) in demo mode. */
export function useCvi(wallet: Address | undefined, opts: { withAuthorization?: boolean } = {}): CviResult {
  const [demoTick, setDemoTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ['cvi', wallet?.toLowerCase(), Boolean(opts.withAuthorization)],
    queryFn: async () => {
      const [cvi, authorized] = await Promise.all([readCvi(wallet!), opts.withAuthorization ? readIssuerAuthorized(wallet!) : Promise.resolve(undefined)]);
      return { cvi, authorized };
    },
    enabled: isAnchoringEnabled && Boolean(wallet),
    retry: 1,
    staleTime: 30_000,
  });

  const simulate = useCallback(
    (verified: boolean) => {
      if (!wallet) return;
      setDemoCvi(wallet, verified);
      setDemoTick((t) => t + 1);
    },
    [wallet],
  );

  if (!wallet) return { isLoading: false, status: null, authorized: undefined };
  if (!isAnchoringEnabled) {
    // localStorage is read after mount so server and client render the same first frame.
    void demoTick;
    return { isLoading: !mounted, status: mounted ? demoCvi(wallet) : null, authorized: undefined, simulate };
  }
  if (q.isPending) return { isLoading: true, status: null, authorized: undefined };
  if (q.isError || !q.data) return { isLoading: false, status: CVI_UNKNOWN, authorized: undefined };
  return { isLoading: false, status: cviFromChain(q.data.cvi, Math.floor(Date.now() / 1000)), authorized: q.data.authorized };
}
