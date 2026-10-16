import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as moduleCache from '../../src/utils/modelCache.js';
import { TTLCache } from '../../src/utils/modelCache.js';

describe('TTLCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores and returns values, null for unknown keys', () => {
    const c = new TTLCache<string>();
    c.set('a', 'x', 1000);
    expect(c.get('a')).toBe('x');
    expect(c.get('missing')).toBeNull();
  });

  it('expires entries: the cleanup timer removes them', () => {
    const c = new TTLCache<string>();
    c.set('a', 'x', 1000);
    jest.advanceTimersByTime(999);
    expect(c.size).toBe(1);
    jest.advanceTimersByTime(2);
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeNull();
  });

  it('never serves a stale value even if the timer has not fired yet', () => {
    let now = 1_000;
    const c = new TTLCache<string>(10, () => now);
    c.set('a', 'x', 500);
    now = 1_499;
    expect(c.get('a')).toBe('x');
    now = 1_500;
    expect(c.get('a')).toBeNull();
    expect(c.size).toBe(0);
  });

  it('overwriting resets the TTL and the old timer cannot delete the new entry', () => {
    const c = new TTLCache<string>();
    c.set('a', 'old', 1000);
    jest.advanceTimersByTime(900);
    c.set('a', 'new', 1000);
    jest.advanceTimersByTime(500); // the first timer's deadline has passed
    expect(c.get('a')).toBe('new');
    expect(jest.getTimerCount()).toBe(1);
  });

  it('evicts the oldest entry when full', () => {
    const c = new TTLCache<number>(3);
    for (const [i, k] of ['a', 'b', 'c', 'd'].entries()) c.set(k, i, 10_000);
    expect(c.size).toBe(3);
    expect(c.get('a')).toBeNull();
    expect(c.get('d')).toBe(3);
    c.set('b', 99, 10_000); // re-inserting b makes it the newest
    c.set('e', 4, 10_000);
    expect(c.get('c')).toBeNull();
    expect(c.get('b')).toBe(99);
  });

  it('delete and clear remove entries and their timers', () => {
    const c = new TTLCache<string>();
    c.set('a', '1', 1000);
    c.set('b', '2', 1000);
    c.delete('a');
    c.delete('never-existed');
    expect(c.size).toBe(1);
    c.clear();
    expect(c.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects invalid arguments', () => {
    expect(() => new TTLCache(0)).toThrow(RangeError);
    expect(() => new TTLCache(1.5)).toThrow(RangeError);
    const c = new TTLCache<string>();
    for (const ttl of [0, -1, NaN, Infinity]) expect(() => c.set('a', 'x', ttl)).toThrow(RangeError);
  });

  it('stays consistent under many interleaved concurrent operations', async () => {
    const c = new TTLCache<number>(50);
    await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        await Promise.resolve();
        c.set(`k${i % 80}`, i, 10_000);
        c.get(`k${(i * 7) % 80}`);
        if (i % 11 === 0) c.delete(`k${i % 80}`);
      })
    );
    expect(c.size).toBeLessThanOrEqual(50);
    expect(jest.getTimerCount()).toBe(c.size); // exactly one live timer per entry, none leaked
  });

  it('unrefs its timers so it never keeps the process alive', () => {
    jest.useRealTimers();
    const c = new TTLCache<string>();
    c.set('a', 'x', 60_000);
    // A ref'd 60s timer would hang the jest worker at exit; reaching here and clearing is enough.
    c.clear();
  });
});

describe('module-level cache functions', () => {
  afterEach(() => {
    moduleCache.clear();
  });

  it('get / set / clear operate on the shared instance', () => {
    moduleCache.set('k', { n: 1 }, 1000);
    expect(moduleCache.get<{ n: number }>('k')).toEqual({ n: 1 });
    expect(moduleCache.modelCache.size).toBe(1);
    moduleCache.clear();
    expect(moduleCache.get('k')).toBeNull();
  });
});
