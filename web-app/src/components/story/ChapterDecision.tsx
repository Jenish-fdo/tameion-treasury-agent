'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { StatusStamp } from '@/components/evidence/StatusStamp';
import { cn } from '@/lib/utils';
import { AGREEMENT_HELP, CONFIDENCE_HELP, VERDICT_COPY, type Verdict } from '@/lib/verdict';
import { ChapterHeading } from './ChapterHeading';
import { EvidenceLabel } from './EvidenceLabel';
import { DECISION_ORDER, DECISION_STATES } from './story-data';

const BOARD: Record<Verdict, string> = { GO: 'border-go bg-go-soft', STOP: 'border-stop bg-stop-soft', REVIEW: 'border-review bg-review-soft' };
const TAB_ON: Record<Verdict, string> = { GO: 'bg-go text-sheet border-go', STOP: 'bg-stop text-sheet border-stop', REVIEW: 'bg-review text-sheet border-review' };

/**
 * Chapter 05. Purely illustrative: no network access of any kind. The "continue" control is enabled
 * only in the GO state, mirroring the live product, and even then does nothing but explain itself.
 */
export function ChapterDecision() {
  const [verdict, setVerdict] = useState<Verdict>('GO');
  const [note, setNote] = useState(false);
  const [arrived, setArrived] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Verdict, HTMLButtonElement | null>>({ GO: null, STOP: null, REVIEW: null });
  const s = DECISION_STATES[verdict];
  const copy = VERDICT_COPY[verdict];

  // The stamp arrives once, the first time the board is on screen.
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setArrived(true);
        o.disconnect();
      }
    }, { threshold: 0.4 });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const select = (v: Verdict) => {
    setVerdict(v);
    setNote(false);
  };
  const onKey = (e: KeyboardEvent, v: Verdict) => {
    const i = DECISION_ORDER.indexOf(v);
    const next = { ArrowRight: DECISION_ORDER[(i + 1) % 3], ArrowLeft: DECISION_ORDER[(i + 2) % 3], Home: DECISION_ORDER[0], End: DECISION_ORDER[2] }[e.key];
    if (!next) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="chapter-05" aria-labelledby="h-05" className="border-b border-line bg-paper-deep py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <div className="lg:col-span-5">
          <ChapterHeading
            id="h-05" eyebrow="CASE 001 / DECISION LAYER"
            lines={['Proceed only when the evidence agrees.']}
            body="Credentia makes the safe next action obvious: GO, STOP, or REVIEW."
          />
          <div className="mt-10" data-reveal>
            <p id="tabs-label" className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">Choose an illustrative outcome</p>
            <div role="tablist" aria-labelledby="tabs-label" className="mt-3 inline-flex border border-ink">
              {DECISION_ORDER.map((v) => (
                <button
                  key={v} ref={(el) => { tabRefs.current[v] = el; }} role="tab" id={`tab-${v}`} type="button"
                  aria-selected={verdict === v} aria-controls="decision-panel" tabIndex={verdict === v ? 0 : -1}
                  onClick={() => select(v)} onKeyDown={(e) => onKey(e, v)}
                  className={cn('border-r border-ink px-6 py-3 font-mono text-sm font-semibold uppercase tracking-[0.14em] last:border-r-0', verdict === v ? TAB_ON[v] : 'bg-sheet hover:bg-paper')}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="mt-4 max-w-sm text-sm text-ink-soft">Use the arrow keys to move between outcomes. This board is a drawing: it never contacts a server or a model.</p>
          </div>
        </div>

        <div className="lg:col-span-7" ref={boardRef} data-reveal>
          <div id="decision-panel" role="tabpanel" aria-labelledby={`tab-${verdict}`} tabIndex={0} className={cn('rounded-md border-2 p-5 shadow-sheet sm:p-8', BOARD[verdict])}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Decision board / case 001</p>
                <p className="mt-2 text-sm font-semibold">{copy.explain}</p>
              </div>
              <div className="stamp-wrap">
                <div className={cn(arrived && 'stamp-arrive')}>
                  <StatusStamp verdict={verdict} className="text-2xl sm:text-4xl" />
                </div>
              </div>
            </div>

            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="border border-ink/40 bg-sheet p-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Confidence</dt>
                <dd className="font-mono text-3xl font-semibold" data-testid="decision-confidence">{s.confidence} / 100</dd>
                <p className="mt-1 text-xs text-ink-soft">{CONFIDENCE_HELP}</p>
              </div>
              <div className="border border-ink/40 bg-sheet p-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Agreement</dt>
                <dd className="font-mono text-3xl font-semibold" data-testid="decision-agreement">{s.agreement}%</dd>
                <p className="mt-1 text-xs text-ink-soft">{AGREEMENT_HELP}</p>
              </div>
            </dl>

            <div className="mt-4 border border-ink/40 bg-sheet p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Flags</p>
              <p className="mt-1 font-semibold" data-testid="decision-flag">{s.flag ?? 'No flags raised'}</p>
            </div>

            <div className="mt-4 border border-ink/40 bg-sheet p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Recommended action</p>
              <p className="mt-1 text-lg font-semibold" data-testid="decision-action">{s.action}</p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" disabled={verdict !== 'GO'} aria-describedby="continue-help" onClick={() => setNote(true)}>
                Continue to payment (illustration)
              </button>
              <EvidenceLabel tone="review">Illustrative demo data</EvidenceLabel>
            </div>
            <p id="continue-help" className="mt-2 text-xs text-ink-soft">
              {verdict === 'GO' ? 'Only a GO enables this control. It sends nothing on this page.' : 'Disabled: only a GO enables this control.'}
            </p>
            {note && (
              <p role="status" className="mt-3 border-2 border-signal bg-signal-soft px-4 py-3 text-sm">
                Illustration only: no payment flow exists on this page.{' '}
                <Link href="/payment-check" className="font-semibold underline underline-offset-4">Try the live check →</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
