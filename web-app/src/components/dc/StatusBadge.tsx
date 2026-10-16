import { AlertTriangle, BadgeCheck, Ban, Clock, FlaskConical, HelpCircle, SearchX, TimerOff, type LucideIcon } from 'lucide-react';
import { STATUS_LABEL, type CredentialStatus } from '@/lib/dc/credential';
import { cn } from '@/lib/utils';

const STYLE: Record<CredentialStatus, { cls: string; Icon: LucideIcon }> = {
  VERIFIED: { cls: 'border-go bg-go-soft text-go', Icon: BadgeCheck },
  PENDING: { cls: 'border-signal bg-signal-soft text-ink', Icon: Clock },
  REVOKED: { cls: 'border-stop bg-stop-soft text-stop', Icon: Ban },
  EXPIRED: { cls: 'border-review bg-review-soft text-review', Icon: TimerOff },
  NOT_FOUND: { cls: 'border-stop bg-stop-soft text-stop', Icon: SearchX },
  MISMATCH: { cls: 'border-stop bg-stop-soft text-stop', Icon: AlertTriangle },
  DEMO: { cls: 'border-review bg-review-soft text-review', Icon: FlaskConical },
  UNAVAILABLE: { cls: 'border-line bg-paper-deep text-ink', Icon: HelpCircle },
};

/** Status is always icon + words + colour, never colour alone. */
export function StatusBadge({ status, className }: { status: CredentialStatus; className?: string }) {
  const { cls, Icon } = STYLE[status];
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]', cls, className)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
