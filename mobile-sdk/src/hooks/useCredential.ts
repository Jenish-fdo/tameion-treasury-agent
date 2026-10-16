import type { Credential } from '../types';
import { isCredentialId } from '../utils/validation';
import { useCredentia } from './CredentiaProvider';
import { useAsync, type AsyncState } from './useAsync';

/** Verification result for `credentialId`. Makes no request while it is empty or invalid. */
export function useCredential(credentialId?: string): AsyncState<Credential> {
  const sdk = useCredentia();
  return useAsync(isCredentialId(credentialId), credentialId?.toLowerCase(), (signal) => sdk.verifyCredential(credentialId as string, { signal }));
}
