import { cn } from '@/lib/utils';
import { VERDICT_COPY, type Verdict } from '@/lib/verdict';

const COLOR: Record<Verdict, string> = {
  GO: 'border-go text-go',
  STOP: 'border-stop text-stop',
  REVIEW: 'border-review text-review',
};

/** Large verdict stamp. Large bold text on the cream sheet keeps the semantic colours above contrast minimums. */
export function StatusStamp({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Verdict: ${VERDICT_COPY[verdict].stamp}`}
      className={cn('inline-block rounded border-[3px] bg-sheet px-4 py-2 font-mono text-xl font-semibold uppercase tracking-[0.14em] sm:text-2xl', COLOR[verdict], className)}
    >
      <span aria-hidden="true">{VERDICT_COPY[verdict].stamp}</span>
    </div>
  );
}
