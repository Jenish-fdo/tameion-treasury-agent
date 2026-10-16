import { VERDICT_COPY, type Verdict } from '@/lib/verdict';

export const CHAPTERS = [
  { id: 'chapter-01', n: '01', name: 'The transfer' },
  { id: 'chapter-02', n: '02', name: 'The missing evidence' },
  { id: 'chapter-03', n: '03', name: 'The case file' },
  { id: 'chapter-04', n: '04', name: 'Independent assessment' },
  { id: 'chapter-05', n: '05', name: 'The decision' },
  { id: 'chapter-06', n: '06', name: 'The safeguard' },
] as const;

/** Everything on the story page that looks like data is illustrative. This is the one demo case. */
export const DEMO_CASE = {
  caseNo: 'CASE 001',
  amount: '1,250.00 AUSD',
  recipient: '0x7F3a…91Bc',
  timestamp: '09 OCT 2026 · 09:41 UTC',
};

export const EVIDENCE_GAPS = ['Verified identity', 'Credential history', 'Payment-risk explanation'] as const;

export const DOSSIER_INSERTS = [
  { title: 'IDENTITY CREDENTIAL — VERIFIED', detail: 'Credential issued to the recipient address.', caption: 'Identity credential added', tone: 'signal' as const },
  { title: 'ACCOUNT HISTORY — DEMO PROFILE', detail: 'Prior on-chain activity, summarised.', caption: 'Account history added', tone: 'neutral' as const },
  { title: 'CONTEXT NOTE — “Invoice #42”', detail: 'The payer’s description of the payment.', caption: 'Payment context added', tone: 'neutral' as const },
  { title: 'TRUST INDICATOR — 87 / 100', detail: 'Summary of available signals.', caption: 'Trust indicator added', tone: 'signal' as const },
];

export const ANALYST_REPORTS = [
  { id: 'kimi', name: 'KIMI', report: 'REPORT 01', verdict: 'GO' as const, confidence: 92, reasoning: 'Known credential pattern; context consistent.', time: '09:41:03 UTC' },
  { id: 'qwen', name: 'QWEN', report: 'REPORT 02', verdict: 'GO' as const, confidence: 88, reasoning: 'No high-risk language identified.', time: '09:41:05 UTC' },
  { id: 'jev', name: 'JEV', report: 'REPORT 03', verdict: 'REVIEW' as const, confidence: 63, reasoning: 'Counterparty history is limited.', time: '09:41:04 UTC' },
];

export interface DecisionState {
  verdict: Verdict;
  confidence: number;
  agreement: number;
  flag: string | null;
  action: string;
}

export const DECISION_STATES: Record<Verdict, DecisionState> = {
  GO: { verdict: 'GO', confidence: 87, agreement: 80, flag: null, action: VERDICT_COPY.GO.headline },
  STOP: { verdict: 'STOP', confidence: 91, agreement: 86, flag: 'Recipient behavior requires review', action: VERDICT_COPY.STOP.headline },
  REVIEW: { verdict: 'REVIEW', confidence: 66, agreement: 52, flag: 'Model signals are inconclusive', action: VERDICT_COPY.REVIEW.headline },
};
export const DECISION_ORDER: Verdict[] = ['GO', 'STOP', 'REVIEW'];
