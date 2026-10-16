import { cn } from '@/lib/utils';
import { VERDICT_COPY } from '@/lib/verdict';
import { ChapterHeading } from './ChapterHeading';
import { EvidenceLabel } from './EvidenceLabel';
import { ANALYST_REPORTS } from './story-data';

const OFFSETS = ['lg:mt-0', 'lg:mt-10', 'lg:mt-20'];

/** Three sheets, three different layouts, one document system. All values are illustrative. */
export function ChapterAnalystReports() {
  const [kimi, qwen, jev] = ANALYST_REPORTS;
  const meta = (r: (typeof ANALYST_REPORTS)[number]) => (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{r.time}</p>
      <EvidenceLabel tone="review" className="mt-2">Simulated model output</EvidenceLabel>
    </>
  );
  const verdictLabel = (r: (typeof ANALYST_REPORTS)[number]) => (
    <EvidenceLabel tone={VERDICT_COPY[r.verdict].tone}>{r.verdict} — {VERDICT_COPY[r.verdict].explain}</EvidenceLabel>
  );

  return (
    <section id="chapter-04" aria-labelledby="h-04" className="border-b border-line py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ChapterHeading
          className="max-w-3xl" id="h-04" eyebrow="CASE 001 / INDEPENDENT REVIEW"
          lines={['One payment.', 'Three independent assessments.']}
          body="Kimi, Qwen, and Jev review the same payment context independently. Credentia compares their signals instead of relying on one black box."
        />

        <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:gap-8">
          {/* 01: typed memo */}
          <article aria-label="Kimi report 01" data-reveal className={cn('rounded-md border border-ink bg-sheet shadow-sheet', OFFSETS[0])}>
            <header className="flex items-center justify-between border-b border-ink px-5 py-3">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">{kimi.name} / {kimi.report}</h3>
              <span className="font-mono text-[10px] text-ink-soft">MEMO</span>
            </header>
            <div className="space-y-4 p-5">
              {verdictLabel(kimi)}
              <p className="font-mono text-5xl font-semibold">{kimi.confidence}<span className="text-base text-ink-soft"> / 100</span></p>
              <p className="text-ink-soft">“{kimi.reasoning}”</p>
              <div>{meta(kimi)}</div>
            </div>
          </article>

          {/* 02: ruled worksheet with a tick scale */}
          <article aria-label="Qwen report 02" data-reveal style={{ ['--d' as string]: '120ms' }} className={cn('rounded-md border border-line border-t-2 border-t-ink bg-sheet shadow-sheet', OFFSETS[1])}>
            <header className="border-b border-line px-5 py-3">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">{qwen.name} / {qwen.report}</h3>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Worksheet</p>
            </header>
            <div className="space-y-4 bg-[repeating-linear-gradient(transparent,transparent_27px,var(--line)_28px)] p-5">
              {verdictLabel(qwen)}
              <div>
                <p className="font-mono text-4xl font-semibold">{qwen.confidence}<span className="text-base text-ink-soft"> / 100</span></p>
                <div className="mt-2 flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: 20 }, (_, i) => (
                    <span key={i} className={cn('h-3 flex-1 border border-ink', i < Math.round(qwen.confidence / 5) ? 'bg-ink' : 'bg-sheet')} />
                  ))}
                </div>
              </div>
              <p className="text-ink-soft">“{qwen.reasoning}”</p>
              <div>{meta(qwen)}</div>
            </div>
          </article>

          {/* 03: inspection form with a margin note */}
          <article aria-label="Jev report 03" data-reveal style={{ ['--d' as string]: '240ms' }} className={cn('rounded-md border border-review border-l-4 bg-sheet shadow-sheet', OFFSETS[2])}>
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">{jev.name} / {jev.report}</h3>
              <span className="font-mono text-[10px] text-ink-soft">FORM</span>
            </header>
            <div className="space-y-4 p-5">
              {verdictLabel(jev)}
              <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="border border-line p-2"><dt className="text-ink-soft">VERDICT</dt><dd className="text-base font-semibold">{jev.verdict}</dd></div>
                <div className="border border-line p-2"><dt className="text-ink-soft">CONFIDENCE</dt><dd className="text-base font-semibold">{jev.confidence} / 100</dd></div>
              </dl>
              <p className="text-ink-soft">“{jev.reasoning}”</p>
              <p className="border-t border-dashed border-ink-soft pt-3 font-mono text-[11px] uppercase tracking-[0.12em]">Margin note: models disagree, so Credentia does not clear this payment alone.</p>
              <div>{meta(jev)}</div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
