import Link from 'next/link';
import { CasePanel } from '@/components/evidence/CasePanel';
import { EmptyState } from '@/components/evidence/States';
import { EvidenceLabel } from '@/components/evidence/EvidenceLabel';
import { credentialStatus, type CredentialRecord, type FactorKey, type TrustProfile } from '@/lib/api';
import { DEMO_LABEL, DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { shortenAddress } from '@/lib/utils';
import { TRUST_SCORE_HELP, type Tone } from '@/lib/verdict';
import { CredentialTable } from './CredentialTable';

export type ProfileStatus = 'VERIFIED' | 'UNVERIFIED' | 'LIMITED HISTORY';

/** VERIFIED = at least one active credential; LIMITED HISTORY = scored but no active credential; otherwise UNVERIFIED. */
export function profileStatus(profile: TrustProfile, credentials: CredentialRecord[]): ProfileStatus {
  if (credentials.some((c) => credentialStatus(c) === 'active')) return 'VERIFIED';
  return profile.score > 0 || profile.lastUpdated > 0 ? 'LIMITED HISTORY' : 'UNVERIFIED';
}
const STATUS_TONE: Record<ProfileStatus, Tone> = { VERIFIED: 'signal', 'LIMITED HISTORY': 'review', UNVERIFIED: 'neutral' };

export function scoreExplanation(score: number): string {
  const s = Math.round(score);
  if (s <= 30) return 'Limited evidence or elevated concerns';
  if (s <= 60) return 'Some evidence available; verify before paying';
  return 'Stronger evidence available; continue with normal caution';
}

const FACTOR_COPY: Record<FactorKey, { label: string; text: string }> = {
  credentials: { label: 'Active credentials', text: 'Valid, unexpired credentials issued to this address.' },
  attestations: { label: 'Attestations', text: 'Statements about this address recorded by other parties.' },
  staking: { label: 'Staked AUSD', text: 'AUSD locked as a commitment signal.' },
};

export const formatUtc = (sec: number): string => (sec === 0 ? 'Never' : `${new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`);

/** Evidence ruler: 0-100 scale with the three guidance bands and a marker at the score. */
function EvidenceRuler({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="mt-4" role="img" aria-label={`Trust score ${Math.round(score)} on a scale of 0 to 100`}>
      <div className="relative h-8 border border-ink bg-paper">
        <div className="absolute inset-y-0 left-[30%] border-l border-ink/50" />
        <div className="absolute inset-y-0 left-[60%] border-l border-ink/50" />
        <div className="absolute inset-y-0 w-0.5 bg-signal" style={{ left: `${pct}%` }} />
        <div className="absolute -top-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-signal" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex font-mono text-[10px] uppercase tracking-wider text-ink-soft">
        <span className="w-[30%]">0–30 limited</span>
        <span className="w-[30%]">31–60 some</span>
        <span className="w-[40%] text-right">61–100 stronger</span>
      </div>
    </div>
  );
}

export function TrustDossierView({ profile, credentials, demo = false }: { profile: TrustProfile; credentials: CredentialRecord[]; demo?: boolean }) {
  const status = profileStatus(profile, credentials);
  return (
    <div className="space-y-6">
      {demo && (
        <p className="rounded border-2 border-review bg-review-soft px-4 py-2 font-mono text-xs uppercase tracking-[0.12em]" role="note">
          {DEMO_LABEL}: this profile is synthetic and not read from the chain.
        </p>
      )}

      <CasePanel title="Trust dossier" tone={status === 'VERIFIED' ? 'signal' : 'neutral'} label={<EvidenceLabel tone={STATUS_TONE[status]}>{status}</EvidenceLabel>}>
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              Trust score
            </p>
            <p className="mt-1 inline-block rounded border-[3px] border-ink bg-sheet px-4 py-2 font-mono text-5xl font-semibold" data-testid="trust-score">
              {Math.round(profile.score)}
              <span className="text-lg text-ink-soft"> / 100</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-sm break-all" title={profile.address}>{profile.address}</p>
            <p className="mt-2 text-sm font-semibold">{scoreExplanation(profile.score)}</p>
            <p className="mt-1 text-xs text-ink-soft">
              Last updated: <span className="font-mono">{formatUtc(profile.lastUpdated)}</span>. {TRUST_SCORE_HELP}
            </p>
          </div>
        </div>
        <EvidenceRuler score={profile.score} />
      </CasePanel>

      <CasePanel title="Score breakdown" label={<EvidenceLabel>{profile.factors.length} factors reported on-chain</EvidenceLabel>}>
        <ul className="divide-y divide-line">
          {profile.factors.map((f) => {
            const copy = FACTOR_COPY[f.key];
            const weight = f.weightBps / 100;
            const contribution = (f.points * weight) / 100;
            return (
              <li key={f.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold">{copy.label}</p>
                  <p className="text-sm text-ink-soft">{copy.text}</p>
                  <div className="mt-2 h-2 max-w-sm bg-paper-deep" aria-hidden="true">
                    <div className="h-full bg-ink" style={{ width: `${Math.min(100, f.points)}%` }} />
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-4 font-mono text-xs sm:text-right">
                  <div><dt className="text-ink-soft">VALUE</dt><dd className="text-sm font-semibold">{Math.round(f.points)}/100</dd></div>
                  <div><dt className="text-ink-soft">WEIGHT</dt><dd className="text-sm font-semibold">{weight}%</dd></div>
                  <div><dt className="text-ink-soft">ADDS</dt><dd className="text-sm font-semibold">{contribution.toFixed(1)} pts</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </CasePanel>

      <CasePanel title="Credentials" label={<EvidenceLabel>{credentials.length} on file</EvidenceLabel>}>
        <CredentialTable credentials={credentials} />
      </CasePanel>

      <CasePanel title="Latest transactions" label={demo ? <EvidenceLabel tone="review">{DEMO_LABEL}</EvidenceLabel> : undefined}>
        {demo ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Illustrative demo transactions</caption>
              <thead className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                <tr><th className="py-2 pr-4">Date</th><th className="pr-4">Counterparty</th><th className="pr-4">Amount</th><th className="pr-4">Token</th><th>Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {DEMO_TRANSACTIONS.map((t) => (
                  <tr key={t.date}><td className="py-2 pr-4 font-mono">{t.date}</td><td className="pr-4 font-mono">{t.counterparty}</td><td className="pr-4 font-mono">{t.amount}</td><td className="pr-4 font-mono">{t.token}</td><td>{t.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState tag="NO HISTORY" title="No payment history is available for this demo profile." />
        )}
      </CasePanel>

      <div className="flex flex-wrap gap-3">
        <Link href="/credential/create" className="btn-primary">Mint credential</Link>
        <Link href="/payment-check" className="btn-signal">Check a payment</Link>
      </div>
      <p className="text-xs text-ink-soft">Profile for <span className="font-mono">{shortenAddress(profile.address)}</span>. Only actions that work today are shown.</p>
    </div>
  );
}
