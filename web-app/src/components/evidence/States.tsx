import { cn } from '@/lib/utils';
import { EvidenceLabel } from './EvidenceLabel';

/** Nothing to show yet: states what is missing and, when useful, the next step. */
export function EmptyState({ title, children, tag = 'NO RECORD', className }: { title: string; children?: React.ReactNode; tag?: string; className?: string }) {
  return (
    <div className={cn('rounded border border-dashed border-ink/40 bg-sheet/60 p-6 text-center', className)}>
      <EvidenceLabel>{tag}</EvidenceLabel>
      <p className="mt-3 font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

/** A failure the user can understand. Never shows raw error text. */
export function ErrorState({ title, message, className }: { title: string; message: string; className?: string }) {
  return (
    <div role="alert" className={cn('rounded border border-stop border-l-4 bg-stop-soft p-5', className)}>
      <EvidenceLabel tone="stop">CHECK FAILED</EvidenceLabel>
      <h2 className="mt-2 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{message}</p>
    </div>
  );
}

export function SkeletonBar({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('h-3 rounded bg-paper-deep', className)} />;
}

/** Document-style loading sheet (the page announces progress separately, with role="status"). */
export function CaseFileSkeleton({ title, subtitle, rows = 3 }: { title: string; subtitle?: string; rows?: number }) {
  return (
    <div data-testid="case-skeleton" className="animate-pulse rounded-md border border-line border-t-2 border-t-signal bg-sheet p-4 shadow-sheet">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{title}</p>
      {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonBar key={i} className={i === rows - 1 ? 'w-2/3' : 'w-full'} />
        ))}
      </div>
    </div>
  );
}
