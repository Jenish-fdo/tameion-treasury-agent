'use client';

import { useAccount } from '@/components/account';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { ConsensusResultCard } from '@/components/ConsensusResultCard';
import { ModelVerdictSkeleton } from '@/components/ModelVerdictCard';
import { PaymentIntentForm, type PaymentIntentValues } from '@/components/PaymentIntentForm';
import { usePaymentRiskCheck } from '@/hooks/usePaymentRiskCheck';
import { EmptyState, ErrorState } from '@/components/evidence/States';
import { ERROR_COPY, type ModelName } from '@/lib/api';
import { shortenAddress } from '@/lib/utils';

/** Used as the sender when no account is signed in. A well-known local-testnet address, not a real user. */
const DEMO_SENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SKELETON_MODELS: ModelName[] = ['kimi', 'qwen', 'jev'];

export default function PaymentCheckPage() {
  const { address } = useAccount();
  const { state, analyze } = usePaymentRiskCheck();
  const from = address ?? DEMO_SENDER;

  const handleSubmit = (values: PaymentIntentValues) => {
    void analyze({ from, ...values });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="container max-w-4xl space-y-8 py-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Live case / simulation only</p>
            <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Payment Risk Check</h1>
            <p className="mt-3 max-w-2xl text-ink-soft">
              Check a payment against three independent AI risk models before you send it. This is a simulation: no
              wallet transaction is signed or sent.
            </p>
          </div>

          <PaymentIntentForm
            onSubmit={handleSubmit}
            isLoading={state.status === 'loading'}
            fromLabel={address ? `${shortenAddress(address)} (your account)` : `${shortenAddress(DEMO_SENDER)} (demo sender)`}
          />

          <div aria-live="polite">
            {state.status === 'idle' && (
              <EmptyState tag="AWAITING CASE" title="No payment under review yet">
                Fill in the payment details, or load a demo, then choose “Analyze payment risk”.
              </EmptyState>
            )}

            {state.status === 'loading' && (
              <div className="space-y-4">
                <p role="status" className="text-sm font-semibold">
                  Credentia is checking this payment with three independent risk models…
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  {SKELETON_MODELS.map((m) => (
                    <ModelVerdictSkeleton key={m} model={m} />
                  ))}
                </div>
              </div>
            )}

            {state.status === 'error' && (
              <ErrorState title={ERROR_COPY[state.error.kind].title} message={ERROR_COPY[state.error.kind].message} />
            )}

            {state.status === 'success' && <ConsensusResultCard result={state.result} />}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
