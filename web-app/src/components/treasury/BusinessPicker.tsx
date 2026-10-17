'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { BUSINESS_ID } from '@/hooks/useBusinessId';
import { errorText, treasuryFetch } from '@/lib/treasury';
import { shortenAddress } from '@/lib/utils';

interface Owners {
  owners: string[];
}
interface BusinessCreated {
  businessId: string;
  owner: string;
  relayerAuthorized: boolean;
  status: 'confirmed' | 'pending';
}

/** Choose the business to work on, or register a demo business with one of the backend's demo owners. */
export function BusinessPicker({ businessId, onChange }: { businessId: string; onChange: (id: string) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(businessId);
  const [owner, setOwner] = useState('');
  const owners = useQuery({ queryKey: ['owners'], queryFn: () => treasuryFetch<Owners>('businesses/owners'), retry: 1 });
  const register = useMutation({
    mutationFn: (o: string) => treasuryFetch<BusinessCreated>('businesses', { method: 'POST', body: { owner: o, salt: `demo-${Date.now()}` } }),
    onSuccess: (b) => {
      setDraft(b.businessId);
      onChange(b.businessId);
      void qc.invalidateQueries();
    },
  });
  const valid = BUSINESS_ID.test(draft.trim());
  const chosenOwner = owner || owners.data?.owners[0] || '';

  return (
    <section aria-label="Business" className="dc-sheet dc-paper space-y-4 p-5">
      <div>
        <label htmlFor="business-id" className="dc-label text-ink">Business ID</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            id="business-id"
            className="input min-w-0 flex-1 font-mono"
            placeholder="0x… (32 bytes)"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={draft !== '' && !valid}
          />
          <button type="button" className="btn-secondary" disabled={!valid} onClick={() => onChange(draft.trim())}>Use this business</button>
        </div>
        {draft !== '' && !valid && <p role="alert" className="mt-1 text-sm text-stop">A business ID is 0x followed by 64 hex characters.</p>}
      </div>

      <div className="border-t border-line pt-4">
        <p className="dc-label">No business yet?</p>
        {owners.isPending ? (
          <p role="status" className="mt-2 text-sm text-ink-soft">Looking for demo owners…</p>
        ) : owners.isError ? (
          <p role="alert" className="mt-2 text-sm text-stop">Could not load the demo owners. {errorText(owners.error)}</p>
        ) : owners.data.owners.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">The backend has no demo owner keys configured (BUSINESS_OWNER_PRIVATE_KEYS), so businesses cannot be registered here.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="owner" className="sr-only">Demo owner</label>
            <select id="owner" className="input w-auto font-mono" value={chosenOwner} onChange={(e) => setOwner(e.target.value)}>
              {owners.data.owners.map((o) => <option key={o} value={o}>{shortenAddress(o)}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={register.isPending || !chosenOwner} onClick={() => register.mutate(chosenOwner)}>
              {register.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Register a demo business
            </button>
          </div>
        )}
        {register.isError && <p role="alert" className="mt-2 rounded border border-stop bg-stop-soft p-2 text-sm">{errorText(register.error)}</p>}
        {register.isSuccess && (
          <p role="status" className="mt-2 text-sm">
            Business registered{register.data.relayerAuthorized ? ' and the relayer authorised to record decisions' : ', but the relayer could not be authorised yet'}.
          </p>
        )}
      </div>
    </section>
  );
}
