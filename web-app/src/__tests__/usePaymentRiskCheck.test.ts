import { act, renderHook } from '@testing-library/react';
import { usePaymentRiskCheck, type CheckPaymentFn } from '@/hooks/usePaymentRiskCheck';
import { PaymentCheckError, normalizeResult } from '@/lib/api';
import { rawResult } from './testUtils';

const request = { from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', to: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', amount: '1', token: 'AUSD', context: 'x' };
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('usePaymentRiskCheck', () => {
  it('goes idle -> loading -> success', async () => {
    const d = deferred<ReturnType<typeof normalizeResult>>();
    const { result } = renderHook(() => usePaymentRiskCheck((() => d.promise) as CheckPaymentFn));
    expect(result.current.state.status).toBe('idle');
    let run!: Promise<void>;
    act(() => { run = result.current.analyze(request); });
    expect(result.current.state.status).toBe('loading');
    await act(async () => { d.resolve(normalizeResult(rawResult('GO'))); await run; });
    expect(result.current.state).toMatchObject({ status: 'success', result: { verdict: 'GO', isSafeToProceed: true } });
  });

  it('keeps known error kinds and turns unexpected errors into a generic service error', async () => {
    const check = jest.fn<ReturnType<CheckPaymentFn>, Parameters<CheckPaymentFn>>()
      .mockRejectedValueOnce(new PaymentCheckError('rate_limit', 429))
      .mockRejectedValueOnce(new Error('db password is hunter2'));
    const { result } = renderHook(() => usePaymentRiskCheck(check));
    await act(async () => { await result.current.analyze(request); });
    expect(result.current.state).toMatchObject({ status: 'error', error: { kind: 'rate_limit' } });
    await act(async () => { await result.current.analyze(request); });
    const state = result.current.state;
    expect(state.status === 'error' && state.error.kind).toBe('service');
    expect(JSON.stringify(state)).not.toContain('hunter2');
  });

  it('a newer check cancels the older one: a late stale response cannot overwrite it', async () => {
    const first = deferred<ReturnType<typeof normalizeResult>>();
    const second = deferred<ReturnType<typeof normalizeResult>>();
    const signals: AbortSignal[] = [];
    const check = jest.fn<ReturnType<CheckPaymentFn>, Parameters<CheckPaymentFn>>()
      .mockImplementationOnce(async (_r, o) => { signals.push(o.signal); return first.promise; })
      .mockImplementationOnce(async (_r, o) => { signals.push(o.signal); return second.promise; });
    const { result } = renderHook(() => usePaymentRiskCheck(check));

    let run1!: Promise<void>;
    let run2!: Promise<void>;
    act(() => { run1 = result.current.analyze(request); });
    act(() => { run2 = result.current.analyze(request); });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await act(async () => { second.resolve(normalizeResult(rawResult('STOP'))); await run2; });
    await act(async () => { first.resolve(normalizeResult(rawResult('GO'))); await run1; });
    expect(result.current.state).toMatchObject({ status: 'success', result: { verdict: 'STOP' } });
  });

  it('reset returns to idle and ignores a response that arrives afterwards', async () => {
    const d = deferred<ReturnType<typeof normalizeResult>>();
    const { result } = renderHook(() => usePaymentRiskCheck((() => d.promise) as CheckPaymentFn));
    let run!: Promise<void>;
    act(() => { run = result.current.analyze(request); });
    act(() => result.current.reset());
    await act(async () => { d.resolve(normalizeResult(rawResult('GO'))); await run; });
    expect(result.current.state.status).toBe('idle');
  });

  it('aborts the in-flight request on unmount', () => {
    let signal!: AbortSignal;
    const check: CheckPaymentFn = (_r, o) => { signal = o.signal; return new Promise(() => {}); };
    const { result, unmount } = renderHook(() => usePaymentRiskCheck(check));
    act(() => { void result.current.analyze(request); });
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
