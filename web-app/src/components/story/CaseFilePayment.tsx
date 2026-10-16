import { cn } from '@/lib/utils';
import { EvidenceLabel } from './EvidenceLabel';
import { DEMO_CASE } from './story-data';

export type ReceiptVariant = 'transfer' | 'redacted' | 'dossier';

const Redact = ({ w = '7rem', label = 'redacted' }: { w?: string; label?: string }) => (
  <span className="redact" role="img" aria-label={label} style={{ ['--w' as string]: w }} />
);

/**
 * The payment receipt that anchors the whole story. `fill` makes it a fixed-proportion grid so the
 * dossier's annotation lines can point at the recipient row (row 4 of 7, centred at 45.5% of the height).
 */
export function CaseFilePayment({ variant = 'transfer', fill = false, className }: { variant?: ReceiptVariant; fill?: boolean; className?: string }) {
  const redacted = variant === 'redacted';
  const row = 'flex min-h-0 items-center justify-between gap-3 border-b border-line px-4 sm:px-5';
  return (
    <article
      aria-label="Demo transfer authorization"
      className={cn('grid rounded-md border border-ink bg-sheet shadow-sheet', fill && 'h-full', className)}
      style={fill ? { gridTemplateRows: 'minmax(0,12fr) minmax(0,15fr) minmax(0,11fr) minmax(0,15fr) minmax(0,13fr) minmax(0,11fr) minmax(0,23fr)' } : undefined}
    >
      <header className={cn(row, 'py-3')}>
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">Transfer authorization</h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{DEMO_CASE.caseNo}</p>
        </div>
        <EvidenceLabel tone="review">DEMO DATA</EvidenceLabel>
      </header>

      <div className={cn(row, 'py-2')}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Amount</span>
        <span className="font-mono text-xl font-semibold sm:text-3xl">{DEMO_CASE.amount}</span>
      </div>

      <div className={cn(row, 'py-1.5')}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">From</span>
        {redacted ? <Redact w="6rem" /> : <span className="font-mono text-sm">Your wallet</span>}
      </div>

      <div className={cn(row, 'py-2')}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Recipient</span>
        <span className="font-mono text-base font-semibold sm:text-lg" data-recipient>{DEMO_CASE.recipient}</span>
      </div>

      <div className={cn(row, 'py-2')}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Status</span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          <EvidenceLabel>{variant === 'dossier' ? 'Case open — evidence attached' : 'Identity unverified'}</EvidenceLabel>
          {redacted && <EvidenceLabel tone="stop">Insufficient evidence</EvidenceLabel>}
        </span>
      </div>

      <div className={cn(row, 'py-1.5')}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Date / time</span>
        {redacted ? <Redact w="9rem" /> : <span className="font-mono text-xs">{DEMO_CASE.timestamp} · DEMO DATA</span>}
      </div>

      <div className="flex min-h-0 flex-col justify-center gap-1 px-4 py-2 sm:px-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Payment route</p>
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-signal bg-sheet" />
          <svg viewBox="0 0 300 10" preserveAspectRatio="none" className="h-2.5 w-full">
            <line x1="0" y1="5" x2="290" y2="5" stroke="var(--signal)" strokeWidth="2" />
            <path d="M282 1 L292 5 L282 9" fill="none" stroke="var(--signal)" strokeWidth="2" />
          </svg>
          <span className="h-2.5 w-2.5 shrink-0 bg-signal" />
        </div>
        <p className="sr-only">A payment route from your wallet to the recipient, with no verification step in between.</p>
      </div>
    </article>
  );
}
