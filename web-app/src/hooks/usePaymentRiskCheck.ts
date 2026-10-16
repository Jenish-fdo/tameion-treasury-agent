'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkPayment, PaymentCheckError, type PaymentCheckRequest, type PaymentCheckResult } from '@/lib/api';

export type PaymentRiskCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: PaymentCheckResult }
  | { status: 'error'; error: PaymentCheckError };

export type CheckPaymentFn = (request: PaymentCheckRequest, options: { signal: AbortSignal }) => Promise<PaymentCheckResult>;

/**
 * Runs one payment risk check at a time. Starting a new check (or unmounting) cancels the one in
 * flight, and a stale response can never overwrite a newer state.
 *
 * `check` is injectable for tests; it defaults to the real API client.
 */
export function usePaymentRiskCheck(check: CheckPaymentFn = checkPayment) {
  const [state, setState] = useState<PaymentRiskCheckState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const analyze = useCallback(
    async (request: PaymentCheckRequest) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: 'loading' });
      try {
        const result = await check(request, { signal: controller.signal });
        if (controllerRef.current === controller) setState({ status: 'success', result });
      } catch (err) {
        if (controller.signal.aborted || controllerRef.current !== controller) return;
        // Anything unexpected is shown as a generic service error: never surface raw error text.
        setState({ status: 'error', error: err instanceof PaymentCheckError ? err : new PaymentCheckError('service') });
      }
    },
    [check]
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, analyze, reset };
}
