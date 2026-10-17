import type { Assessment } from './credential';

export type CheckState = 'pass' | 'fail' | 'skip';
export interface Check {
  label: string;
  state: CheckState;
  note: string;
}

/** The four questions behind a status, so a verifier can see WHY, not just a badge. */
export function checksFor(a: Assessment, hasPayload: boolean): Check[] {
  const s = a.status;
  const onChain = s !== 'DEMO' && s !== 'UNAVAILABLE' && s !== 'NOT_FOUND';
  return [
    { label: 'Link read', state: 'pass', note: hasPayload ? 'Credential details found in the link.' : 'Credential ID found. No details attached.' },
    {
      label: 'Registry checked',
      state: s === 'DEMO' ? 'skip' : onChain ? 'pass' : 'fail',
      note: s === 'DEMO' ? 'Demo credential: nothing on-chain to check.' : s === 'UNAVAILABLE' ? 'The registry could not be reached.' : s === 'NOT_FOUND' ? 'No record with this ID.' : 'Record found on Arc.',
    },
    {
      label: 'Details match',
      state: !hasPayload || !onChain ? 'skip' : s === 'MISMATCH' ? 'fail' : 'pass',
      note: !hasPayload ? 'Nothing to compare.' : !onChain ? 'Skipped.' : s === 'MISMATCH' ? 'The link was changed after issuing.' : 'Link details match the on-chain fingerprint.',
    },
    {
      label: 'Still active',
      state: s === 'VERIFIED' ? 'pass' : s === 'REVOKED' || s === 'EXPIRED' ? 'fail' : 'skip',
      note: s === 'VERIFIED' ? 'Not revoked and not expired.' : s === 'REVOKED' ? 'Revoked by the issuer.' : s === 'EXPIRED' ? 'Past its expiry date.' : 'Skipped.',
    },
  ];
}
