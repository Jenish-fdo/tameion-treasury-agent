import Link from 'next/link';
import { CaseFilePayment } from './CaseFilePayment';
import { ChapterHeading } from './ChapterHeading';

export function ChapterTransfer() {
  return (
    <section id="chapter-01" aria-labelledby="h-01" className="relative min-h-[100svh] border-b border-line pb-24 pt-16 lg:pb-40">
      <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <div className="lg:col-span-6 lg:pt-10">
          <ChapterHeading
            id="h-01" level={1} eyebrow="CASE 001 / PAYMENT PENDING"
            lines={['Money moves in seconds.', 'Trust usually arrives too late.']}
            body="A payment can be irreversible before you know who is on the other side."
          />
          <div className="mt-10 flex flex-wrap items-center gap-4" data-reveal style={{ ['--d' as string]: '240ms' }}>
            <Link href="/payment-check" className="btn-primary">Open payment check</Link>
            <a href="#chapter-02" className="font-mono text-xs font-semibold uppercase tracking-[0.16em] underline underline-offset-8 decoration-2 hover:decoration-signal">
              View the evidence ↓
            </a>
          </div>
        </div>
        <div className="story-sticky lg:col-span-6 lg:col-start-7">
          <CaseFilePayment variant="transfer" />
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Illustrative receipt. Wallet and transaction are not real.</p>
        </div>
      </div>
    </section>
  );
}
