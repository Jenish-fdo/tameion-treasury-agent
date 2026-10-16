'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Address, LocalAccount } from 'viem';
import {
  createPasskeyAccount,
  forgetPasskey,
  hasRememberedPasskey,
  passkeyErrorMessage,
  unlockPasskeyAccount,
  type PasskeyAccount,
} from '@/lib/mera';

/** The app's account layer: a Mera passkey account, or nothing. There is no extension-wallet path. */
export interface AccountState {
  address: Address | undefined;
  isConnected: boolean;
  /** The unlocked passkey account, used to sign transactions in this tab. */
  signer: LocalAccount | null;
  /** True when this browser has used a passkey here before. */
  remembered: boolean;
  busy: boolean;
  error: string | null;
  /** Unlock the remembered passkey, or create a passkey account when there is none. */
  connect: () => Promise<void>;
  create: () => Promise<void>;
  /** Pick any existing Credentia passkey on this device. */
  signInExisting: () => Promise<void>;
  /** End the signing session and zero the in-memory key. */
  lock: () => void;
  /** Lock, and forget which passkey this browser used. */
  forget: () => void;
}

const noop = async () => {};
const EMPTY: AccountState = {
  address: undefined,
  isConnected: false,
  signer: null,
  remembered: false,
  busy: false,
  error: null,
  connect: noop,
  create: noop,
  signInExisting: noop,
  lock: () => {},
  forget: () => {},
};

const AccountContext = createContext<AccountState>(EMPTY);

export function PasskeyAccountProvider({ children }: { children: ReactNode }) {
  const session = useRef<PasskeyAccount | null>(null);
  const [signer, setSigner] = useState<LocalAccount | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRemembered(hasRememberedPasskey()), []);

  const lock = useCallback(() => {
    session.current?.lock();
    session.current = null;
    setSigner(null);
  }, []);

  // Zero the key if the provider ever unmounts.
  useEffect(() => lock, [lock]);

  const open = useCallback(async (start: () => Promise<PasskeyAccount>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await start();
      session.current?.lock();
      session.current = next;
      setSigner(next.account);
      setRemembered(true);
    } catch (e) {
      setError(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<AccountState>(
    () => ({
      address: signer?.address,
      isConnected: Boolean(signer),
      signer,
      remembered,
      busy,
      error,
      connect: () => open(hasRememberedPasskey() ? unlockPasskeyAccount : createPasskeyAccount),
      create: () => open(createPasskeyAccount),
      signInExisting: () => open(unlockPasskeyAccount),
      lock,
      forget: () => {
        lock();
        forgetPasskey();
        setRemembered(false);
      },
    }),
    [signer, remembered, busy, error, open, lock],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Passkey account for the current tab. Safe to call without a provider (returns a signed-out state). */
export function useAccount(): AccountState {
  return useContext(AccountContext);
}
