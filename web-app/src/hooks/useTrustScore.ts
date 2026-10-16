'use client';

import { useQuery } from '@tanstack/react-query';
import { getCredentialsFor, getTrustProfile, PaymentCheckError, type CredentialRecord, type TrustProfile } from '@/lib/api';

export interface TrustDossier {
  profile: TrustProfile;
  credentials: CredentialRecord[];
  /** True when the address has never been scored and has no credentials issued through Credentia. */
  isUnknown: boolean;
}

/** Public read: trust profile plus credentials issued through Credentia. Needs no wallet. */
export function useTrustScore(address: string | null) {
  return useQuery<TrustDossier, PaymentCheckError>({
    queryKey: ['trust-dossier', address?.toLowerCase()],
    enabled: Boolean(address),
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const [profile, credentials] = await Promise.all([getTrustProfile(address!, { signal }), getCredentialsFor(address!, { signal })]);
      return { profile, credentials, isUnknown: profile.lastUpdated === 0 && profile.score === 0 && credentials.length === 0 };
    },
  });
}
