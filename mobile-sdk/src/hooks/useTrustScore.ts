import type { TrustScore } from '../types';
import { isAddress } from '../utils/validation';
import { useCredentia } from './CredentiaProvider';
import { useAsync, type AsyncState } from './useAsync';

/** Trust score for `address`. Makes no request while `address` is empty or invalid. */
export function useTrustScore(address?: string): AsyncState<TrustScore> {
  const sdk = useCredentia();
  return useAsync(isAddress(address), address?.toLowerCase(), (signal) => sdk.checkTrustScore(address as string, { signal }));
}
