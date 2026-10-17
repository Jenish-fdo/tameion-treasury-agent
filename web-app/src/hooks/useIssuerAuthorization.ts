'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { isAnchoringEnabled, readIssuerAuthorized } from '@/lib/dc/registry';

export interface IssuerAuthorization {
  isLoading: boolean;
  /** Owner authorisation on the registry; undefined in demo mode, with no wallet, or while the registry cannot be read. */
  authorized: boolean | undefined;
}

/** Whether the registry owner has authorised this wallet to issue credentials. */
export function useIssuerAuthorization(wallet: Address | undefined): IssuerAuthorization {
  const enabled = isAnchoringEnabled && Boolean(wallet);
  const q = useQuery({
    queryKey: ['issuer-authorized', wallet?.toLowerCase()],
    queryFn: () => readIssuerAuthorized(wallet!),
    enabled,
    retry: 1,
    staleTime: 30_000,
  });
  return { isLoading: enabled && q.isPending, authorized: q.data };
}
