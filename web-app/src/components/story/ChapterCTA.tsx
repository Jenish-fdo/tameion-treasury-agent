import Link from 'next/link';
import { SAFETY_STATEMENT } from '@/lib/verdict';
import { ChapterHeading } from './ChapterHeading';
import { EvidenceLabel } from './EvidenceLabel';

/** Closeout sheet. The secondary "architecture" link is omitted: the repo configuration has no verified docs URL. */
export function ChapterCTA() {
  return (
    <section id="chapter-06" aria-labelledby="h-06" className="py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <ChapterHeading
          className="lg:col-span-6" id="h-06" eyebrow="CASE CLOSED / NEXT ACTION"
          lines={['Trust checks belong inside the payment flow.']}
          body="Credentia gives people and AI agents a clear risk signal before value becomes irreversible."
        />
        <div className="lg:col-span-6" data-reveal>
          <div className="rounded-md border-2 border-ink bg-sheet p-6 shadow-sheet sm:p-8">
            <div className="flex items-start justify-between gap-4 border-b border-ink pb-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Case 001</p>
                <h3 className="font-mono text-lg font-semibold uppercase tracking-[0.12em]">Closeout</h3>
              </div>
              <EvidenceLabel>Case closed</EvidenceLabel>
            </div>
            <dl className="divide-y divide-line font-mono text-sm">
              <div className="flex justify-between gap-4 py-3"><dt className="text-ink-soft">DISPOSITION</dt><dd>Check before you pay</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-ink-soft">ONLY GO PROCEEDS</dt><dd>STOP / REVIEW do not</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-ink-soft">FILED BY</dt><dd>Credentia payment evidence layer</dd></div>
            </dl>
            <div className="mt-6 border-t-2 border-signal pt-6">
              <Link href="/payment-check" className="btn-primary w-full sm:w-auto">Try the live payment check</Link>
            </div>
            <p className="mt-6 border border-line bg-paper p-3 font-mono text-xs leading-relaxed">{SAFETY_STATEMENT}</p>
          </div>
        </div>
      </div>
      <footer className="mx-auto mt-24 max-w-7xl border-t border-line px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Footer" className="flex flex-wrap gap-6 font-mono text-xs uppercase tracking-[0.14em]">
          <Link href="/payment-check" className="underline-offset-4 hover:underline">Check payment</Link>
          <Link href="/dashboard" className="underline-offset-4 hover:underline">Dashboard</Link>
          <Link href="/credential/create" className="underline-offset-4 hover:underline">Create credential</Link>
        </nav>
      </footer>
    </section>
  );
}
