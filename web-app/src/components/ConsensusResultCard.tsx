'use client';

import { useEffect, useState } from 'react';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { HelpTip } from '@/components/evidence/HelpTip';
import { StatusStamp } from '@/components/evidence/StatusStamp';
import type { PaymentCheckResult } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AGREEMENT_HELP, CONFIDENCE_HELP, SAFETY_STATEMENT, VERDICT_COPY, type Verdict } from '@/lib/verdict';
import { ModelVerdictCard } from './ModelVerdictCard';

const BOX: Record<Verdict, string> = {
  GO: 'border-go bg-go-soft',
  STOP: 'border-stop bg-stop-soft',
  REVIEW: 'border-review bg-review-soft',
};

const FLAG_LABELS: Record<string, string> = {
  PROMPT_INJECTION_SUSPECTED: 'The payment description looks like an attempt to instruct the AI models.',
};

const DEMO_DISABLED_MESSAGE = 'Payment flow intentionally disabled in this hackathon demo.';

function Stat({ label, value, tip }: { label: string; value: string; tip: { label: string; text: string } | null }) {
  return (
    <div className="rounded border border-line bg-sheet px-3 py-2">
      <dt className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
        {label}
        {tip && <HelpTip label={tip.label} text={tip.text} />}
      </dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

/**
 * Shows a consensus result. Permission to continue comes from `result.isSafeToProceed` only:
 * the verdict string, confidence and agreement are display values and never unlock the button.
 */
export function ConsensusResultCard({ result }: { result: PaymentCheckResult }) {
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Anything that is not an explicit "safe" is shown as blocked or review, never as safe.
  const view: Verdict = result.isSafeToProceed ? 'GO' : result.verdict === 'STOP' ? 'STOP' : 'REVIEW';
  const copy = VERDICT_COPY[view];

  return (
    <section aria-label="Payment risk result" className="space-y-5">
      <div className={cn('rounded-md border border-l-4 p-5', BOX[view])}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Case disposition</p>
            <h2 className="mt-1 font-display text-3xl leading-tight" data-testid="verdict-headline">{copy.headline}</h2>
            <p className="mt-2 text-sm text-ink-soft">{result.recommendedAction}</p>
            <p className="mt-2 text-sm font-semibold">
              <span className="font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-soft">In plain words: </span>
              {copy.explain}
            </p>
          </div>
          <StatusStamp verdict={view} />
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Final verdict" value={result.verdict} tip={null} />
          <Stat label="Confidence" value={`${Math.round(result.confidence)}/100`} tip={{ label: 'About confidence', text: CONFIDENCE_HELP }} />
          <Stat label="Agreement" value={`${Math.round(result.agreement * 100)}%`} tip={{ label: 'About agreement', text: AGREEMENT_HELP }} />
        </dl>

        {result.flags.length > 0 && (
          <div className="mt-4 rounded border border-review bg-sheet p-3" role="note" aria-label="Risk flags">
            <EvidenceLabel tone="review">Risk flags</EvidenceLabel>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {result.flags.map((flag) => (
                <li key={flag}>{FLAG_LABELS[flag] ?? flag.replace(/_/g, ' ').toLowerCase()}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Independent model assessments</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {result.modelResults.map((m) => (
            <ModelVerdictCard key={m.model} result={m} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" className="btn-primary" disabled={!result.isSafeToProceed} onClick={() => setToast(true)}>
          Continue to payment (demo)
        </button>
        {!result.isSafeToProceed && <p className="text-sm text-ink-soft">Disabled: this payment was not cleared by the risk check.</p>}
      </div>

      {toast && (
        <div role="status" className="flex items-start justify-between gap-3 rounded border-2 border-signal bg-signal-soft px-4 py-3 text-sm">
          <span>{DEMO_DISABLED_MESSAGE}</span>
          <button type="button" className="underline" onClick={() => setToast(false)}>
            Dismiss
          </button>
        </div>
      )}

      {result.cached && <p className="text-xs text-ink-soft">Served from a recent identical check (cached for up to 5 minutes).</p>}

      <p className="font-mono text-xs leading-relaxed text-ink-soft">{SAFETY_STATEMENT}</p>
    </section>
  );
}
