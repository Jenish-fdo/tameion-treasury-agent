import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/verdict';

const TONES: Record<Tone, { box: string; mark: string }> = {
  neutral: { box: 'border-ink/40 bg-transparent', mark: 'bg-ink-soft' },
  signal: { box: 'border-signal bg-signal-soft', mark: 'bg-signal' },
  go: { box: 'border-go bg-go-soft', mark: 'bg-go' },
  stop: { box: 'border-stop bg-stop-soft', mark: 'bg-stop' },
  review: { box: 'border-review bg-review-soft', mark: 'bg-review' },
};

/**
 * Small rectangular mono tag. Text is always ink (readable on every background); colour lives in
 * the border and a square marker, and the meaning is always spelled out in words.
 */
export function EvidenceLabel({ tone = 'neutral', marker = true, className, children }: { tone?: Tone; marker?: boolean; className?: string; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span className={cn('evidence-tag', t.box, className)}>
      {marker && <span aria-hidden="true" className={cn('inline-block h-1.5 w-1.5 shrink-0', t.mark)} />}
      {children}
    </span>
  );
}
