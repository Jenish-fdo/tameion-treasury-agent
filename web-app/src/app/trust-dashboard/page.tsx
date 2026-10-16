'use client';

import { useState, type FormEvent } from 'react';
import { TrustDossierView } from '@/components/dashboard/TrustDossierView';
import { CaseFileSkeleton, EmptyState, ErrorState } from '@/components/evidence/States';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { useTrustScore } from '@/hooks/useTrustScore';
import { ADDRESS_PATTERN, ERROR_COPY } from '@/lib/api';
import { DEMO_CREDENTIALS, DEMO_PROFILE } from '@/lib/demo-data';

export default function DashboardPage() {
  const [input, setInput] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const query = useTrustScore(demo ? null : address);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!ADDRESS_PATTERN.test(value)) {
      setInputError('Enter a full 0x… address (42 characters).');
      return;
    }
    setInputError(null);
    setDemo(false);
    setAddress(value);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="container max-w-4xl space-y-8 py-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Public records / no wallet needed</p>
            <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Trust dashboard</h1>
            <p className="mt-3 max-w-2xl text-ink-soft">Open the evidence file for any address: trust score, credentials, and how the score is built.</p>
          </div>

          <details className="rounded border border-line bg-sheet p-4 text-sm">
            <summary className="cursor-pointer font-semibold">What am I looking at?</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft">
              <li><strong className="text-ink">Trust score:</strong> a summary of available credentials and activity signals. It is not a guarantee of safety.</li>
              <li><strong className="text-ink">Breakdown:</strong> the factors the on-chain score reports, each with its weight.</li>
              <li><strong className="text-ink">Credentials:</strong> signed statements about an address, such as identity checks. Check that they are active and from an issuer you trust.</li>
              <li><strong className="text-ink">Before paying:</strong> use the payment check for a GO / STOP / REVIEW signal on a specific payment.</li>
            </ul>
          </details>

          <form onSubmit={submit} className="card space-y-3" aria-label="Look up a trust profile" noValidate>
            <label htmlFor="lookup" className="block font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Look up a trust profile</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="lookup" className="input font-mono" placeholder="0x… address" value={input} onChange={(e) => setInput(e.target.value)}
                autoComplete="off" spellCheck={false} aria-invalid={inputError ? true : undefined} aria-describedby={inputError ? 'lookup-error' : undefined}
              />
              <button type="submit" className="btn-primary shrink-0">Open case file</button>
            </div>
            {inputError && <p id="lookup-error" role="alert" className="text-sm text-stop">{inputError}</p>}
            <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setDemo(true); setAddress(null); setInputError(null); }}>
              Or load an illustrative demo profile
            </button>
          </form>

          <div aria-live="polite">
            {demo && <TrustDossierView profile={DEMO_PROFILE} credentials={DEMO_CREDENTIALS} demo />}

            {!demo && !address && <EmptyState tag="NO CASE OPEN" title="Enter an address to open its evidence file." />}

            {!demo && address && query.isPending && (
              <div className="space-y-4">
                <p role="status" className="text-sm font-semibold">Opening the case file for this address…</p>
                <CaseFileSkeleton title="Trust dossier" rows={3} />
                <CaseFileSkeleton title="Score breakdown" rows={4} />
              </div>
            )}

            {!demo && address && query.isError && query.error.kind === 'not_found' && (
              <EmptyState tag="NOT FOUND" title="No Credentia evidence file exists for this address yet." />
            )}
            {!demo && address && query.isError && query.error.kind !== 'not_found' && (
              <ErrorState title={ERROR_COPY[query.error.kind].title} message={ERROR_COPY[query.error.kind].message} />
            )}

            {!demo && address && query.data &&
              (query.data.isUnknown ? (
                <EmptyState tag="NOT FOUND" title="No Credentia evidence file exists for this address yet.">
                  This address has no trust score and no credentials issued through Credentia.
                </EmptyState>
              ) : (
                <TrustDossierView profile={query.data.profile} credentials={query.data.credentials} />
              ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
