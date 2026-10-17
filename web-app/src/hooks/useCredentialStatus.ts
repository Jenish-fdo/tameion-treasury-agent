'use client';

import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { assess, type Assessment, type OnChainCredential, type SharePayload } from '@/lib/dc/credential';
import { isAnchoringEnabled, readCredential } from '@/lib/dc/registry';

export interface CredentialStatusResult {
  isLoading: boolean;
  chain: OnChainCredential | null | undefined;
  assessment: Assessment | null;
}

/** Reads the credential from the Arc registry (skipped for demo credentials) and decides what to tell the verifier. */
export function useCredentialStatus(id: Hex, payload: SharePayload | null): CredentialStatusResult {
  const demo = Boolean(payload?.demo);
  const q = useQuery({
    queryKey: ['credential-chain', id],
    queryFn: () => readCredential(id),
    enabled: !demo && isAnchoringEnabled,
    retry: 1,
    staleTime: 15_000,
  });

  if (demo) return { isLoading: false, chain: undefined, assessment: assess(payload, id, undefined, 0) };
  if (!isAnchoringEnabled) return { isLoading: false, chain: undefined, assessment: assess(payload, id, undefined, 0) };
  if (q.isPending) return { isLoading: true, chain: undefined, assessment: null };
  const chain = q.isError ? undefined : q.data;
  return { isLoading: false, chain, assessment: assess(payload, id, chain, Math.floor(Date.now() / 1000)) };
}
