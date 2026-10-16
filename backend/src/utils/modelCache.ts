import type { CacheEntry } from '../types/ai.js';

interface Slot<T> extends CacheEntry<T> {
  timer: NodeJS.Timeout;
}

/**
 * In-memory TTL cache with a hard size cap.
 *
 * - Entries expire after their TTL: a timer removes them, and `get` also checks the clock so a
 *   late timer can never serve a stale value.
 * - When full, the oldest-inserted entry is evicted.
 * - Node runs JS on one thread and every operation here is synchronous, so concurrent callers
 *   can never observe a half-updated state.
 * - Timers are unref'd so the cache never keeps the process alive.
 */
export class TTLCache<T> {
  private readonly slots = new Map<string, Slot<T>>();

  constructor(
    private readonly maxEntries = 1000,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError('maxEntries must be a positive integer');
  }

  get size(): number {
    return this.slots.size;
  }

  /** Returns the live value, or null when missing or expired. */
  get(key: string): T | null {
    const slot = this.slots.get(key);
    if (!slot) return null;
    if (slot.expiresAt <= this.now()) {
      this.delete(key);
      return null;
    }
    return slot.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError('ttlMs must be a positive number');
    this.delete(key); // re-inserting also moves the key to the "newest" position
    while (this.slots.size >= this.maxEntries) {
      const oldest = this.slots.keys().next().value as string;
      this.delete(oldest);
    }
    const timer = setTimeout(() => {
      if (this.slots.get(key)?.timer === timer) this.slots.delete(key);
    }, ttlMs);
    timer.unref();
    this.slots.set(key, { value, expiresAt: this.now() + ttlMs, timer });
  }

  delete(key: string): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    clearTimeout(slot.timer);
    this.slots.delete(key);
  }

  clear(): void {
    for (const slot of this.slots.values()) clearTimeout(slot.timer);
    this.slots.clear();
  }
}

/** Shared process-wide instance used by the AI consensus service. */
export const modelCache = new TTLCache<unknown>(1000);

export const get = <T>(key: string): T | null => modelCache.get(key) as T | null;
export const set = <T>(key: string, value: T, ttlMs: number): void => modelCache.set(key, value, ttlMs);
export const clear = (): void => modelCache.clear();
