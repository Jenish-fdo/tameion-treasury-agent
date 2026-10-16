'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CaseFilePayment } from './CaseFilePayment';
import { ChapterHeading } from './ChapterHeading';
import { EvidenceLabel } from './EvidenceLabel';
import { DOSSIER_INSERTS } from './story-data';
import { useReducedMotion } from './useStory';

// Dossier geometry (viewBox 1000x800, same 5:4 ratio as the container, so HTML and SVG line up).
// Receipt: x 0-520. Inserts: x 620-1000, four rows. Recipient row centre: 45.5% of 800 = 364.
const RECIPIENT_Y = 364;
const INSERT_TOPS = [0, 26.25, 52.5, 78.75]; // % of height
const INSERT_H = 21.25;
const ELBOWS = [588, 574, 560, 546];
const centerY = (i: number) => ((INSERT_TOPS[i] + INSERT_H / 2) / 100) * 800;

/**
 * Chapter 03. Native scrolling only: the dossier is `sticky` beside the captions, and each caption
 * reaching the middle of the screen adds one piece of evidence. With reduced motion (or no JS) all
 * evidence is shown at once and nothing is pinned.
 */
export function ChapterCaseFile() {
  const reduced = useReducedMotion();
  const captionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [revealed, setRevealed] = useState<boolean[] | null>(null); // null = show everything

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setRevealed(null);
      return;
    }
    // Recompute from real positions every time the observer fires. Event-driven bookkeeping breaks when a
    // reader jumps past the chapter (anchor link): a caption that never changes visibility never reports.
    const recompute = () =>
      setRevealed(captionRefs.current.map((el) => !!el && el.getBoundingClientRect().top < window.innerHeight * 0.6));
    recompute();
    const observer = new IntersectionObserver(recompute, { rootMargin: '0px 0px -40% 0px' });
    captionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [reduced]);

  const shown = (i: number) => revealed === null || revealed[i];

  return (
    <section id="chapter-03" aria-labelledby="h-03" className="relative border-b border-line py-24 lg:py-32">
      <span id="how-it-works" className="absolute top-0" aria-hidden="true" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <div className="lg:col-span-5">
          <ChapterHeading
            id="h-03" eyebrow="CASE 001 / CONTEXT ADDED"
            lines={['Credentia turns a payment into a reviewable case.']}
            body="Credentials, on-chain context, and payment details become evidence a person can actually inspect."
          />
          <ol className="mt-12 space-y-6 lg:mt-24 lg:space-y-0">
            {DOSSIER_INSERTS.map((ins, i) => (
              <li key={ins.title} ref={(el) => { captionRefs.current[i] = el; }} className="border-l-2 border-signal pl-4 lg:flex lg:min-h-[45vh] lg:items-center">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">Evidence 0{i + 1}</p>
                  <p className="mt-1 text-lg font-semibold">{ins.caption}</p>
                  <p className="text-ink-soft">{ins.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-7">
          <div className="story-sticky">
            {/* ≥ md: fixed-ratio dossier with annotation lines. Below md: stacked, with a rule per insert. */}
            <div className="relative hidden aspect-[5/4] w-full md:block">
              <div className="absolute left-0 top-0 h-full w-[52%]">
                <CaseFilePayment variant="dossier" fill />
              </div>

              <svg viewBox="0 0 1000 800" className="pointer-events-none absolute inset-0 h-full w-full" role="img" aria-label="Annotation lines connect each piece of evidence to the recipient on the receipt.">
                {DOSSIER_INSERTS.map((ins, i) => (
                  <path
                    key={ins.title}
                    d={`M620 ${centerY(i)} H${ELBOWS[i]} V${RECIPIENT_Y} H520`}
                    pathLength={1} fill="none" stroke="var(--signal)" strokeWidth="2.5"
                    className={cn('line-draw', revealed !== null && 'is-armed', shown(i) && 'is-drawn')}
                  />
                ))}
                <circle cx="520" cy={RECIPIENT_Y} r="6" fill="var(--signal)" />
              </svg>

              {DOSSIER_INSERTS.map((ins, i) => (
                <div
                  key={ins.title}
                  className={cn('insert absolute left-[62%] flex w-[38%] flex-col justify-center gap-1.5 rounded-md border border-line border-l-2 bg-sheet p-3 shadow-sheet', ins.tone === 'signal' ? 'border-l-signal' : 'border-l-ink', !shown(i) && 'is-pending')}
                  style={{ top: `${INSERT_TOPS[i]}%`, height: `${INSERT_H}%` }}
                >
                  <p className="font-mono text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] lg:text-[11px]">{ins.title}</p>
                  <p className="text-xs leading-snug text-ink-soft">{ins.detail}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4 md:hidden">
              <CaseFilePayment variant="dossier" />
              {DOSSIER_INSERTS.map((ins) => (
                <div key={ins.title} className={cn('rounded-md border border-line border-l-2 bg-sheet p-3 shadow-sheet', ins.tone === 'signal' ? 'border-l-signal' : 'border-l-ink')}>
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">{ins.title}</p>
                  <p className="text-sm text-ink-soft">{ins.detail}</p>
                </div>
              ))}
            </div>

            <p className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              <EvidenceLabel tone="review">Demo trust profile / illustrative data</EvidenceLabel>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
