import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/verdict';

const RULE: Record<Tone, string> = {
  neutral: 'border-t-line',
  signal: 'border-t-signal',
  go: 'border-t-go',
  stop: 'border-t-stop',
  review: 'border-t-review',
};

/** A sheet of the case file: cream paper, 1px rules, optional mono title bar and a 2px top rule. */
export function CasePanel({
  title, label, tone = 'neutral', className, children, ...rest
}: { title?: string; label?: React.ReactNode; tone?: Tone; className?: string; children: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={cn('rounded-md border border-line border-t-2 bg-sheet shadow-sheet', RULE[tone], className)} {...rest}>
      {(title || label) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title && <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">{title}</h2>}
          {label}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
