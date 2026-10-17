'use client';

import type { Address, LocalAccount } from 'viem';

/**
 * TEMPORARY account stub (Phase 2).
 *
 * Mera passkey accounts were removed. The real account layer arrives with Circle wallets, so until then nobody is
 * ever signed in: `signer` is always null and everything that needs one (issuing on-chain, recording a verification
 * on-chain) is unavailable. Demo mode, which never touches a chain, is the only path that works end to end.
 *
 * The shape is kept so callers do not change when the real layer replaces this.
 */
export interface AccountState {
  address: Address | undefined;
  isConnected: boolean;
  /** Signs transactions in this tab. Always null while this stub is in place. */
  signer: LocalAccount | null;
  /** False while account sign-in is not implemented. */
  available: boolean;
}

const SIGNED_OUT: AccountState = { address: undefined, isConnected: false, signer: null, available: false };

export function useAccount(): AccountState {
  return SIGNED_OUT;
}
