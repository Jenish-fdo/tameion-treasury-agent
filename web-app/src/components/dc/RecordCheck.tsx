'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Hex } from 'viem';
import { Loader2, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from '@/components/account';
import { recordDemoCheck } from '@/lib/dc/insight';
import { isAnchoringEnabled, writeErrorMessage, writeRegistry } from '@/lib/dc/registry';
import { AccountButton } from './AccountButton';

/**
 * Verifying is free and needs no account. This is the optional last step: leave a receipt of the check
 * on Arc (signed by the verifier's account), which is what the verification count, the
 * history and the issuer's reputation are built from. Demo credentials record in this browser only.
 */
export function RecordCheck({ id, demo, receiptHref, onRecorded }: { id: Hex; demo: boolean; receiptHref: string; onRecorded: () => void }) {
  const { signer } = useAccount();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const local = demo || !isAnchoringEnabled;

  async function record() {
    setError(null);
    setState('busy');
    try {
      if (local) recordDemoCheck(id);
      else if (signer) await writeRegistry(signer, { functionName: 'recordVerification', args: [id] });
      else throw new Error('On-chain receipts need an account, and account sign-in is not available yet.');
      setState('done');
      onRecorded();
      toast.success(local ? 'Demo receipt recorded in this browser' : 'Verification recorded on Arc');
    } catch (e) {
      setError(writeErrorMessage(e, 'Could not record the verification. Nothing was written. Try again.'));
      setState('idle');
    }
  }

  return (
    <section aria-labelledby="record-heading" className="dc-sheet dc-paper p-5">
      <h2 id="record-heading" className="dc-label">Keep a receipt</h2>
      <p className="mt-2 text-sm text-ink-soft">
        {local
          ? 'Demo credential: the receipt is kept in this browser only and proves nothing on-chain.'
          : 'Optional. Record that you checked this credential, and what the registry said, as a transaction from your account.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {state === 'done' ? (
          <>
            <span role="status" className="evidence-tag border-go bg-go-soft"><Stamp className="h-3.5 w-3.5" aria-hidden="true" /> Receipt recorded</span>
            <Link href={receiptHref} className="btn-primary">View receipt</Link>
          </>
        ) : !local && !signer ? (
          <AccountButton label="Receipts need sign-in (coming soon)" />
        ) : (
          <button type="button" className="btn-secondary" disabled={state === 'busy'} onClick={() => void record()}>
            {state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Stamp className="h-3.5 w-3.5" aria-hidden="true" />}
            {state === 'busy' ? 'Recording your verification…' : local ? 'Record a demo receipt' : 'Record this verification on Arc'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded border border-stop bg-stop-soft p-2 text-sm">{error}</p>}
    </section>
  );
}
