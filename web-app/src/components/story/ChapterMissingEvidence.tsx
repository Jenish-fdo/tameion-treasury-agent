import { CaseFilePayment } from './CaseFilePayment';
import { ChapterHeading } from './ChapterHeading';
import { EvidenceLabel } from './EvidenceLabel';
import { EVIDENCE_GAPS } from './story-data';

export function ChapterMissingEvidence() {
  return (
    <section id="chapter-02" aria-labelledby="h-02" className="border-b border-line bg-paper-deep py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <ChapterHeading
          className="lg:col-span-5" id="h-02" eyebrow="CASE 001 / EVIDENCE GAP"
          lines={['A wallet address is not a reputation.']}
          body="An address alone cannot explain identity, history, credibility, or the intent behind a payment."
        />
        <div className="space-y-6 lg:col-span-7" data-reveal>
          <CaseFilePayment variant="redacted" />
          <div className="rounded-md border border-ink bg-sheet shadow-sheet">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">Inspection checklist</h3>
              <EvidenceLabel tone="stop">Insufficient evidence</EvidenceLabel>
            </div>
            <ul>
              {EVIDENCE_GAPS.map((gap) => (
                <li key={gap} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
                  <span aria-hidden="true" className="h-5 w-5 shrink-0 border-2 border-ink" />
                  <span className="font-mono text-sm"><span className="sr-only">Not provided: </span>[ ] {gap}</span>
                  <span aria-hidden="true" className="ml-auto hidden h-px w-1/3 border-b border-dashed border-ink-soft sm:block" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
