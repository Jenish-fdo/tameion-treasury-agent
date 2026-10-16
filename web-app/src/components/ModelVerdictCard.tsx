import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/verdict';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { CaseFileSkeleton } from '@/components/evidence/States';
import type { ModelName, ModelResult, ModelVerdict } from '@/lib/api';

export const MODEL_LABELS: Record<ModelName, { name: string; provider: string }> = {
  kimi: { name: 'Kimi', provider: 'Moonshot AI' },
  qwen: { name: 'Qwen', provider: 'Alibaba Cloud' },
  jev: { name: 'Jev', provider: 'TypeSafe' },
};

const BADGE: Record<ModelVerdict, { label: string; tone: Tone }> = {
  GO: { label: 'GO', tone: 'go' },
  STOP: { label: 'STOP', tone: 'stop' },
  NEUTRAL: { label: 'No answer', tone: 'neutral' },
};

const formatLatency = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** One model's verdict, confidence, short reasoning and response time. */
export function ModelVerdictCard({ result }: { result: ModelResult }) {
  const label = MODEL_LABELS[result.model];
  const badge = BADGE[result.verdict];
  const answered = result.verdict !== 'NEUTRAL';

  return (
    <article aria-label={`${label.name} verdict`} className="flex flex-col gap-3 rounded-md border border-line border-t-2 border-t-ink bg-sheet p-4 shadow-sheet">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">{label.name} report</h4>
          <p className="text-xs text-ink-soft">{label.provider}</p>
        </div>
        <EvidenceLabel tone={badge.tone}>{badge.label}</EvidenceLabel>
      </header>

      <div>
        <div className="mb-1 flex justify-between font-mono text-xs text-ink-soft">
          <span>Confidence</span>
          <span>{answered ? `${Math.round(result.confidence)}/100` : '—'}</span>
        </div>
        <div className="h-1.5 overflow-hidden bg-paper-deep" aria-hidden="true">
          <div
            className={cn('h-full', result.verdict === 'GO' ? 'bg-go' : result.verdict === 'STOP' ? 'bg-stop' : 'bg-line')}
            style={{ width: `${answered ? Math.round(result.confidence) : 0}%` }}
          />
        </div>
      </div>

      {/* Model output is untrusted: rendered as plain text only. */}
      <p className="line-clamp-4 text-sm text-ink-soft">{result.reasoning || 'No explanation provided.'}</p>

      <footer className="mt-auto font-mono text-xs text-ink-soft">Response time: {formatLatency(result.latencyMs)}</footer>
    </article>
  );
}

/** Document-style placeholder shown while the three models are being consulted. */
export function ModelVerdictSkeleton({ model }: { model: ModelName }) {
  const label = MODEL_LABELS[model];
  return <CaseFileSkeleton title={`${label.name} report`} subtitle={label.provider} rows={4} />;
}
