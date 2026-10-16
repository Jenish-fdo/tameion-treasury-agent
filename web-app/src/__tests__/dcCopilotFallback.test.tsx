import { act, renderHook } from '@testing-library/react';
import { AI_UNAVAILABLE, useCopilot } from '@/components/dc/Copilot';

type FakeRes = { status: number; json: () => Promise<unknown> };
function mockFetch(handler: (url: string) => FakeRes) {
  globalThis.fetch = jest.fn((url: RequestInfo | URL) => Promise.resolve(handler(String(url)))) as unknown as typeof fetch;
}
const json = (body: unknown, status = 200): FakeRes => ({ status, json: () => Promise.resolve(body) });
const REQ = { task: 'draft', idea: 'x' } as const;

describe('copilot unavailable fallback', () => {
  it('provider rate limit (429) shows the reassuring unavailable message, not a crash', async () => {
    mockFetch(() => json({ error: 'The copilot is busy. Try again in a moment.' }, 502));
    const { result } = renderHook(() => useCopilot());
    let out: unknown;
    await act(async () => { out = await result.current.call(REQ); });
    expect(out).toBeNull();
    expect(result.current.error).toBe(AI_UNAVAILABLE);
    expect(AI_UNAVAILABLE).toMatch(/Onchain verification remains available/);
  });

  it('a network failure shows the same message', async () => {
    mockFetch(() => { throw new Error('offline'); });
    const { result } = renderHook(() => useCopilot());
    await act(async () => { await result.current.call(REQ); });
    expect(result.current.error).toBe(AI_UNAVAILABLE);
  });

  it('a user mistake (400) keeps its specific message', async () => {
    mockFetch(() => json({ error: 'Tell the copilot what you need first.' }, 400));
    const { result } = renderHook(() => useCopilot());
    await act(async () => { await result.current.call(REQ); });
    expect(result.current.error).toBe('Tell the copilot what you need first.');
  });
});
