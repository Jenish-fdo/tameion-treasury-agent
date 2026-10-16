import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CredentialList } from '../src/components/CredentialList';
import { TrustScoreBadge } from '../src/components/TrustScoreBadge';
import { CredentiaProvider } from '../src/hooks/CredentiaProvider';
import { useCredential } from '../src/hooks/useCredential';
import { useTrustScore } from '../src/hooks/useTrustScore';
import type { AsyncState } from '../src/hooks/useAsync';
import type { Credential, TrustScore } from '../src/types';
import type { CredentiaSDK } from '../src/CredentiaSDK';
import { CredentiaError } from '../src/utils/errors';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ID = `0x${'ab'.repeat(32)}`;
const score = (p: Partial<TrustScore> = {}): TrustScore => ({ address: ADDR, score: 47, category: 'LIMITED', source: 'live', ...p });
const cred = (p: Partial<Credential> = {}): Credential => ({ id: ID, subject: ADDR, issuer: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', type: 'KYC Passed', status: 'ACTIVE', ...p });

type Node = { children?: (Node | string)[] | null } | string | null | (Node | string)[];
const walk = (n: Node): string[] => (n === null ? [] : typeof n === 'string' ? [n] : Array.isArray(n) ? n.flatMap(walk) : (n.children ?? []).flatMap(walk));
/** Visible text only (no props such as accessibility labels), in order. */
const texts = (r: ReactTestRenderer) => walk(r.toJSON() as Node).join('\n');
/** Everything, including accessibility labels. */
const everything = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness<T>(sdk: Partial<CredentiaSDK>, useHook: (input?: string) => AsyncState<T>, initial?: string) {
  const out: { current?: AsyncState<T> } = {};
  const Probe = ({ input }: { input?: string }) => {
    out.current = useHook(input);
    return null;
  };
  const view = (input?: string) => (
    <CredentiaProvider sdk={sdk as CredentiaSDK}>
      <Probe input={input} />
    </CredentiaProvider>
  );
  let r!: ReactTestRenderer;
  act(() => { r = create(view(initial)); });
  return { out, rerender: (input?: string) => act(() => r.update(view(input))), unmount: () => act(() => r.unmount()) };
}

describe('useTrustScore', () => {
  it.each([[undefined], [''], ['0x123'], ['nope']])('makes no request for empty/invalid input %j', async (input) => {
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>();
    const h = harness({ checkTrustScore }, useTrustScore, input);
    await flush();
    expect(checkTrustScore).not.toHaveBeenCalled();
    expect(h.out.current).toMatchObject({ data: undefined, isLoading: false, error: undefined });
  });

  it('loads data: isLoading, then data', async () => {
    const d = deferred<TrustScore>();
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>(() => d.promise);
    const h = harness({ checkTrustScore }, useTrustScore, ADDR);
    expect(h.out.current?.isLoading).toBe(true);
    await act(async () => d.resolve(score()));
    expect(h.out.current).toMatchObject({ isLoading: false, data: { score: 47 }, error: undefined });
    expect(checkTrustScore).toHaveBeenCalledWith(ADDR, expect.objectContaining({ signal: expect.anything() }));
  });

  it('surfaces a typed error', async () => {
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>().mockRejectedValue(new CredentiaError('RATE_LIMITED', 'x', 429));
    const h = harness({ checkTrustScore }, useTrustScore, ADDR);
    await flush();
    expect(h.out.current).toMatchObject({ isLoading: false, data: undefined, error: { code: 'RATE_LIMITED' } });
  });

  it('wraps unexpected errors without exposing their text', async () => {
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>().mockRejectedValue(new Error('internal secret detail'));
    const h = harness({ checkTrustScore }, useTrustScore, ADDR);
    await flush();
    expect(h.out.current?.error?.message).toBe('The request failed.');
  });

  it('cancels the request and ignores its late result on unmount (no state update after unmount)', async () => {
    const d = deferred<TrustScore>();
    let signal!: AbortSignal;
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>((_a, o) => { signal = o!.signal!; return d.promise; });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({ checkTrustScore }, useTrustScore, ADDR);
    h.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => d.resolve(score()));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a changed address cancels the old request and never shows its result', async () => {
    const first = deferred<TrustScore>();
    const second = deferred<TrustScore>();
    const signals: AbortSignal[] = [];
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>()
      .mockImplementationOnce((_a, o) => { signals.push(o!.signal!); return first.promise; })
      .mockImplementationOnce((_a, o) => { signals.push(o!.signal!); return second.promise; });
    const h = harness({ checkTrustScore }, useTrustScore, ADDR);
    h.rerender('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
    expect(signals[0].aborted).toBe(true);
    await act(async () => second.resolve(score({ score: 90, category: 'STRONGER' })));
    await act(async () => first.resolve(score({ score: 5, category: 'LOW' })));
    expect(h.out.current?.data?.score).toBe(90);
  });

  it('refetch asks the API again (no cache); clearing the input drops the data', async () => {
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>().mockResolvedValueOnce(score({ score: 10 })).mockResolvedValueOnce(score({ score: 20 }));
    const h = harness({ checkTrustScore }, useTrustScore, ADDR);
    await flush();
    expect(h.out.current?.data?.score).toBe(10);
    act(() => h.out.current!.refetch());
    await flush();
    expect(h.out.current?.data?.score).toBe(20);
    expect(checkTrustScore).toHaveBeenCalledTimes(2);
    h.rerender('');
    await flush();
    expect(h.out.current?.data).toBeUndefined();
  });

  it('refetch does nothing without valid input', async () => {
    const checkTrustScore = jest.fn<CredentiaSDK['checkTrustScore']>();
    const h = harness({ checkTrustScore }, useTrustScore, '');
    act(() => h.out.current!.refetch());
    await flush();
    expect(checkTrustScore).not.toHaveBeenCalled();
  });

  it('requires the provider', () => {
    const Bad = () => { useTrustScore(ADDR); return null; };
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => act(() => { create(<Bad />); })).toThrow(/CredentiaProvider/);
    errors.mockRestore();
  });
});

describe('useCredential', () => {
  it('only requests valid 32-byte ids, and returns the verification result', async () => {
    const verifyCredential = jest.fn<CredentiaSDK['verifyCredential']>().mockResolvedValue(cred({ status: 'REVOKED' }));
    const bad = harness({ verifyCredential }, useCredential, '0x12');
    await flush();
    expect(verifyCredential).not.toHaveBeenCalled();
    bad.unmount();
    const good = harness({ verifyCredential }, useCredential, ID);
    await flush();
    expect(good.out.current?.data?.status).toBe('REVOKED');
    expect(verifyCredential).toHaveBeenCalledWith(ID, expect.objectContaining({ signal: expect.anything() }));
  });
});

describe('TrustScoreBadge', () => {
  const render = (props: Parameters<typeof TrustScoreBadge>[0]) => { let r!: ReactTestRenderer; act(() => { r = create(<TrustScoreBadge {...props} />); }); return r; };

  it.each([
    [score({ score: 18, category: 'LOW' }), '▼ LOW TRUST  18/100'],
    [score({ score: 47, category: 'LIMITED' }), '◆ LIMITED EVIDENCE  47/100'],
    [score({ score: 78, category: 'STRONGER' }), '▲ STRONGER EVIDENCE  78/100'],
    [score({ score: 0, category: 'UNKNOWN' }), '? NO TRUST DATA  —'],
  ])('shows category as text and symbol: %j', (s, line) => {
    const t = texts(render({ score: s }));
    expect(t).toContain(line);
    expect(t).toContain('A trust score is a signal, not a guarantee of safety.');
  });

  it('has an accessible label with score, category and the disclaimer', () => {
    const r = render({ score: score({ score: 78, category: 'STRONGER' }) });
    const label = r.root.findByProps({ accessibilityRole: 'text' }).props.accessibilityLabel as string;
    expect(label).toContain('STRONGER EVIDENCE');
    expect(label).toContain('trust score 78 out of 100');
    expect(label).toContain('not a guarantee');
  });

  it('compact mode drops the visible disclaimer but keeps it in the accessible label', () => {
    const r = render({ score: score(), compact: true });
    expect(texts(r)).not.toContain('A trust score is a signal');
    expect(r.root.findByProps({ accessibilityRole: 'text' }).props.accessibilityLabel).toContain('not a guarantee');
  });

  it('labels demo data', () => {
    expect(texts(render({ score: score({ source: 'demo' }) }))).toContain('DEMO DATA');
  });

  it('is a button only when onPress is given', () => {
    const onPress = jest.fn();
    const r = render({ score: score(), onPress });
    act(() => r.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(() => render({ score: score() }).root.findByProps({ accessibilityRole: 'button' })).toThrow();
  });

  it('never says trusted / safe / verified', () => {
    for (const category of ['LOW', 'LIMITED', 'STRONGER', 'UNKNOWN'] as const) {
      const r = render({ score: score({ category }) });
      expect(everything(r).toLowerCase()).not.toMatch(/trusted|is safe|guaranteed safe|verified/);
    }
  });
});

describe('CredentialList', () => {
  const render = (props: Parameters<typeof CredentialList>[0]) => { let r!: ReactTestRenderer; act(() => { r = create(<CredentialList {...props} />); }); return r; };

  it('shows the empty message (default and custom)', () => {
    expect(texts(render({ credentials: [] }))).toContain('No credentials found.');
    expect(texts(render({ credentials: [], emptyMessage: 'Nothing here.' }))).toContain('Nothing here.');
  });

  it('shows active and revoked credentials with type, issuer, status text + symbol, and expiry', () => {
    const t = texts(render({ credentials: [cred({ expiresAt: 4_000_000_000 }), cred({ id: `0x${'cd'.repeat(32)}`, type: 'Trusted Merchant', status: 'REVOKED' })] }));
    expect(t).toContain('KYC Passed');
    expect(t).toContain('● ACTIVE');
    expect(t).toContain('Expires 2096-');
    expect(t).toContain('Trusted Merchant');
    expect(t).toContain('✕ REVOKED');
    expect(t).toContain('No expiry');
    expect(t).toContain('Issuer 0x3C44…79C8'.slice(0, 11));
  });

  it('shows expired credentials distinctly', () => {
    expect(texts(render({ credentials: [cred({ status: 'EXPIRED', expiresAt: 5 })] }))).toContain('◌ EXPIRED');
  });

  it('rows are buttons only when onCredentialPress is given, and pass the credential back', () => {
    const onCredentialPress = jest.fn();
    const c = cred();
    const r = render({ credentials: [c], onCredentialPress });
    act(() => r.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
    expect(onCredentialPress).toHaveBeenCalledWith(c);
    expect(() => render({ credentials: [c] }).root.findByProps({ accessibilityRole: 'button' })).toThrow();
  });

  it('every row has an accessible label that includes the status in words', () => {
    const r = render({ credentials: [cred({ status: 'REVOKED' })] });
    expect(r.root.findByProps({ accessible: true }).props.accessibilityLabel).toContain('status REVOKED');
  });
});
