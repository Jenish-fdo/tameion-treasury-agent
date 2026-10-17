'use client';

import { useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, Loader2 } from 'lucide-react';
import { useAccount } from '@/components/account';
import { FAUCET_URL } from '@/lib/arc';
import { shortenAddress } from '@/lib/utils';
import { copyText } from './ShareBlock';

/**
 * The account control: sign in with a passkey, see the address it derives, lock it again.
 * Mera is the only account layer, so there is no wallet-extension button anywhere in the app.
 */
export function PasskeyButton({ label = 'Sign in with passkey' }: { label?: string }) {
  const { address, isConnected, remembered, busy, error, connect, create, signInExisting, lock, forget } = useAccount();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button type="button" className="btn-secondary" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />}
        {isConnected && address ? <span className="font-mono normal-case tracking-normal">{shortenAddress(address)}</span> : label}
      </button>

      {open && (
        <div role="dialog" aria-label="Passkey account" className="dc-sheet absolute right-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] bg-sheet p-5 text-left">
          <p className="dc-label flex items-center gap-1.5 text-ink">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Passkey account · Mera
          </p>

          {isConnected && address ? (
            <>
              <p className="mt-3 break-all font-mono text-xs">{address}</p>
              <p className="mt-3 text-sm text-ink-soft">
                Derived from your passkey in this tab. It needs a little testnet MON to issue credentials or record a verification on Monad.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => void copyText(address, 'Address copied')}>Copy address</button>
                <a className="btn-secondary" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
                  Faucet<span className="sr-only"> (opens in a new tab)</span>
                </a>
                <button type="button" className="btn-secondary" onClick={lock}>Lock</button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 font-display text-2xl leading-tight">Your fingerprint or face is the account.</p>
              <p className="mt-2 text-sm text-ink-soft">
                No seed phrase, no browser extension, no custody server. One prompt creates a passkey; the key is derived from it on this device and never leaves the page.
              </p>
              <div className="mt-4 grid gap-2">
                <button type="button" className="btn-primary" disabled={busy} onClick={() => void (remembered ? connect() : create())}>
                  {remembered ? 'Unlock with passkey' : 'Create passkey account'}
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void (remembered ? create() : signInExisting())}>
                  {remembered ? 'Create a new passkey account' : 'I already have a Credentia passkey'}
                </button>
              </div>
            </>
          )}

          {error && <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-2 text-sm">{error}</p>}
          {remembered && (
            <button type="button" className="mt-4 text-xs font-semibold underline underline-offset-4" onClick={forget}>
              Forget this passkey on this browser
            </button>
          )}
        </div>
      )}
    </div>
  );
}
