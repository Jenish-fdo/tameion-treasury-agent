import { useCallback, useEffect, useRef, useState } from 'react';
import { CredentiaError, isCredentiaError } from '../utils/errors';

export interface AsyncState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: CredentiaError | undefined;
  /** Runs the request again. Does nothing while the input is empty or invalid. */
  refetch: () => void;
}

/**
 * Runs `fetcher` whenever `key` changes and `enabled` is true. Cancels the in-flight request on change or unmount,
 * ignores late results, and keeps no cache: each mount or refetch asks the API again.
 */
export function useAsync<T>(enabled: boolean, key: string | undefined, fetcher: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<CredentiaError | undefined>(undefined);
  const [isLoading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    setData(undefined);
    setError(undefined);
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(isCredentiaError(e) ? e : new CredentiaError('NETWORK', 'The request failed.'));
        setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, key, tick]);

  const refetch = useCallback(() => {
    if (enabled) setTick((t) => t + 1);
  }, [enabled]);

  return { data, isLoading, error, refetch };
}
