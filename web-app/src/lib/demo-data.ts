import type { CredentialRecord, TrustProfile } from '@/lib/api';

/** Synthetic profile used only when the user explicitly asks for it. Every screen that shows it says so. */
export const DEMO_LABEL = 'ILLUSTRATIVE DEMO DATA';
export const DEMO_ADDRESS = '0x1111111111111111111111111111111111111111';
const NOW = 1_790_000_000; // fixed so the demo renders identically everywhere

export const DEMO_PROFILE: TrustProfile = {
  address: DEMO_ADDRESS,
  score: 72,
  lastUpdated: NOW,
  factors: [
    { key: 'credentials', points: 80, weightBps: 4000 },
    { key: 'attestations', points: 65, weightBps: 3500 },
    { key: 'staking', points: 62, weightBps: 2500 },
  ],
};

export const DEMO_CREDENTIALS: CredentialRecord[] = [
  {
    credentialId: `0x${'a1'.repeat(32)}`, issuer: '0x2222222222222222222222222222222222222222', subject: DEMO_ADDRESS,
    credentialType: 'Identity Verification', issuedAt: NOW - 86_400 * 90, expiresAt: NOW + 86_400 * 270, isRevoked: false, metadataUri: null,
  },
  {
    credentialId: `0x${'b2'.repeat(32)}`, issuer: '0x2222222222222222222222222222222222222222', subject: DEMO_ADDRESS,
    credentialType: 'Trusted Merchant', issuedAt: NOW - 86_400 * 400, expiresAt: NOW - 86_400 * 35, isRevoked: false, metadataUri: null,
  },
];

export const DEMO_TRANSACTIONS = [
  { date: '2026-09-28', counterparty: '0x3333…3333', amount: '120.00', token: 'AUSD', status: 'Completed' },
  { date: '2026-09-21', counterparty: '0x4444…4444', amount: '45.50', token: 'AUSD', status: 'Completed' },
  { date: '2026-09-02', counterparty: '0x5555…5555', amount: '980.00', token: 'AUSD', status: 'Held for review' },
];
