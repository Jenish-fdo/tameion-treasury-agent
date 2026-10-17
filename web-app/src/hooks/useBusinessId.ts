'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'credentia.treasury.business';
export const BUSINESS_ID = /^0x[0-9a-fA-F]{64}$/;

/** The business the founder is working on. Remembered in this browser only; the registry is the source of truth. */
export function useBusinessId(): { businessId: string; setBusinessId: (id: string) => void; ready: boolean } {
  const [businessId, setState] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored && BUSINESS_ID.test(stored)) setState(stored);
    } catch {
      /* storage unavailable: nothing is remembered */
    }
    setReady(true);
  }, []);

  const setBusinessId = useCallback((id: string) => {
    const next = id.trim();
    setState(next);
    try {
      if (BUSINESS_ID.test(next)) window.localStorage.setItem(KEY, next);
      else if (next === '') window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { businessId, setBusinessId, ready };
}
