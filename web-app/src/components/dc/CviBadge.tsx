import { FlaskConical, HelpCircle, ShieldAlert, ShieldCheck, ShieldOff, TimerOff, type LucideIcon } from 'lucide-react';
import { CVI_LABEL, type CviState, type CviStatus } from '@/lib/dc/cvi';
import { fmtUnix } from '@/lib/dc/format';
import { cn } from '@/lib/utils';

const STYLE: Record<CviState, { cls: string; Icon: LucideIcon }> = {
  VERIFIED: { cls: 'border-go bg-go-soft text-go', Icon: ShieldCheck },
  NOT_VERIFIED: { cls: 'border-stop bg-stop-soft text-stop', Icon: ShieldAlert },
  EXPIRED: { cls: 'border-review bg-review-soft text-review', Icon: TimerOff },
  GATE_OFF: { cls: 'border-line bg-paper-deep text-ink', Icon: ShieldOff },
  DEMO_VERIFIED: { cls: 'border-review bg-review-soft text-review', Icon: FlaskConical },
  DEMO_NOT_VERIFIED: { cls: 'border-review bg-review-soft text-review', Icon: FlaskConical },
  UNKNOWN: { cls: 'border-line bg-paper-deep text-ink', Icon: HelpCircle },
};

/** Cleanverse Verified Identity status: icon + words + colour, never colour alone. */
export function CviBadge({ state, className }: { state: CviState; className?: string }) {
  const { cls, Icon } = STYLE[state];
  return (
    <span data-cvi={state} className={cn('inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]', cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {CVI_LABEL[state]}
    </span>
  );
}

/** Badge plus the sentence that explains it, and tier/expiry when there is a real record. */
export function CviLine({ status, who }: { status: CviStatus; who: string }) {
  const real = status.state === 'VERIFIED' || status.state === 'EXPIRED';
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="dc-label">{who}</span>
        <CviBadge state={status.state} />
        <span className="rounded border border-line bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft">
          Testnet stand-in
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ink-soft">
        {status.detail}
        {real && status.tier > 0 && ` Tier ${status.tier}.`}
        {real && status.expiresAt > 0 && ` Valid until ${fmtUnix(status.expiresAt)}.`}
      </p>
    </div>
  );
}
