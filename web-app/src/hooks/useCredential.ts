'use client';

import { useQuery } from '@tanstack/react-query';
import { CREDENTIAL_ID_PATTERN, getCredential, PaymentCheckError, type CredentialRecord } from '@/lib/api';

/** Public read of one credential by id. Needs no wallet. A missing id surfaces as error kind "not_found". */
export function useCredential(id: string) {
  return useQuery<CredentialRecord, PaymentCheckError>({
    queryKey: ['credential', id.toLowerCase()],
    enabled: CREDENTIAL_ID_PATTERN.test(id),
    retry: false,
    staleTime: 30_000,
    queryFn: ({ signal }) => getCredential(id, { signal }),
  });
}
