export type Verdict = 'GO' | 'STOP' | 'REVIEW';
export type Tone = 'neutral' | 'signal' | 'go' | 'stop' | 'review';

/** One source of truth for how each verdict is worded everywhere it appears. */
export const VERDICT_COPY: Record<Verdict, { stamp: string; headline: string; explain: string; tone: Tone }> = {
  GO: { stamp: 'CLEARED / GO', headline: 'Safe to proceed', explain: 'Safe to proceed', tone: 'go' },
  STOP: { stamp: 'BLOCKED / STOP', headline: 'Payment blocked — elevated risk detected.', explain: 'Do not send', tone: 'stop' },
  REVIEW: { stamp: 'HOLD / REVIEW', headline: 'Manual review required — do not send yet.', explain: 'Pause and verify manually', tone: 'review' },
};

export const CONFIDENCE_HELP = 'How strongly the available models assessed the result.';
export const AGREEMENT_HELP = 'How much weighted model support the verdict received.';
export const TRUST_SCORE_HELP = 'A summary of available credentials and activity signals. It is not a guarantee of safety.';
export const SAFETY_STATEMENT = 'Credentia provides explainable AI risk signals before a payment. It does not guarantee transaction safety.';
