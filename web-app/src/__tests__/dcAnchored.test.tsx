// The anchored path: a registry is configured and answers. The registry is mocked; nothing touches a chain.
import './ioStub';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Address } from 'viem';
import { VerifyView } from '@/components/dc/VerifyView';
import { dashboardStatus } from '@/components/dc/DashboardView';
import { assess, encodePayload, hashRecord, idForPayload, typeHash, type OnChainCredential, type SharePayload } from '@/lib/dc/credential';

const mockRead = jest.fn();
const mockExtras = jest.fn();
jest.mock('@/lib/dc/registry', () => ({
  isAnchoringEnabled: true,
  registryAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  registryAbi: [],
  readCredential: (...a: unknown[]) => mockRead(...a),
  readIssuerAuthorized: () => Promise.resolve(true),
  readCredentialExtras: (...a: unknown[]) => mockExtras(...a),
  writeRegistry: jest.fn(),
  writeErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/lib/arc', () => ({ arcChain: { id: 5042002 }, ARC_EXPLORER_URL: 'https://explorer.example', ARC_NETWORK_NAME: 'Arc Testnet', ARC_CHAIN_ID: 5042002, FAUCET_URL: 'https://faucet.example' }));

const TX = `0x${'cd'.repeat(32)}` as const;
const payload: SharePayload = {
  v: 1, title: 'Certificate of Completion', recipientName: 'Alex Chen', description: '', salt: '0x00112233445566778899aabbccddeeff',
  issuer: '0x1111111111111111111111111111111111111111' as Address, holder: '0x2222222222222222222222222222222222222222' as Address,
  expiry: 0, issuedAt: Math.floor(Date.now() / 1000) - 60, tx: TX,
};
const chain = (over: Partial<OnChainCredential> = {}): OnChainCredential => ({
  issuer: payload.issuer, holder: payload.holder, credentialType: typeHash(payload.title), dataHash: hashRecord(payload),
  issuedAt: payload.issuedAt, expiryTimestamp: 0, revoked: false, ...over,
});
const view = (p: SharePayload | null = payload) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VerifyView id={idForPayload(payload)} d={p ? encodePayload(p) : undefined} />
    </QueryClientProvider>
  );

beforeEach(() => {
  mockRead.mockReset();
  mockExtras.mockReset().mockResolvedValue({ verificationCount: 3 });
});

describe('verify page, registry configured', () => {
  it('matching, active credential: VERIFIED, with the explorer link to its transaction and the success dialog content', async () => {
    mockRead.mockResolvedValue(chain());
    view();
    expect((await screen.findAllByText('VERIFIED')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Verify on Arc/ })).toHaveAttribute('href', expect.stringMatching(new RegExp(`/tx/${TX}$`)));
    expect(screen.getByText('Credential verified')).toBeInTheDocument();
    expect(screen.getAllByText(TX).length).toBeGreaterThan(0);
  });

  it('shows the on-chain record, and says receipts need sign-in, which is not available yet', async () => {
    mockRead.mockResolvedValue(chain());
    view();
    expect(await screen.findByText('Read from the registry')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/Event history needs the Envio indexer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Receipts need sign-in/ })).toBeInTheDocument();
  });

  it('edited details in the link: DETAILS DO NOT MATCH, never VERIFIED', async () => {
    mockRead.mockResolvedValue(chain());
    view({ ...payload, recipientName: 'Mallory' });
    expect((await screen.findAllByText('DETAILS DO NOT MATCH')).length).toBeGreaterThan(0);
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
    expect(screen.queryByText('Credential verified')).not.toBeInTheDocument();
  });

  it.each([
    ['revoked', chain({ revoked: true }), 'REVOKED'],
    ['expired', chain({ expiryTimestamp: 1 }), 'EXPIRED'],
    ['unknown to the registry', null, 'NOT FOUND'],
  ])('%s: shows %s and never VERIFIED', async (_n, onChain, label) => {
    mockRead.mockResolvedValue(onChain);
    view();
    expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
  });

  it('registry unreachable: CANNOT CHECK, never VERIFIED', async () => {
    mockRead.mockRejectedValue(new Error('rpc down'));
    view();
    // The hook retries once (about a second) before giving up.
    expect((await screen.findAllByText('CANNOT CHECK', {}, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
  });

  it('a link with no details still verifies the on-chain facts and says no details were compared', async () => {
    mockRead.mockResolvedValue(chain());
    view(null);
    expect((await screen.findAllByText('VERIFIED')).length).toBeGreaterThan(0);
    expect(screen.getByText(/carries no personal details/)).toBeInTheDocument();
  });
});

describe('dashboard status mapping (issuer side)', () => {
  const id = idForPayload(payload);
  const notFound = assess(payload, id, null, 0);
  it('a credential just issued that the registry cannot show yet is PENDING', () => {
    expect(dashboardStatus({ id, payload }, notFound, payload.issuedAt + 60)).toBe('PENDING');
  });
  it('after the pending window, not-found stays NOT_FOUND', () => {
    expect(dashboardStatus({ id, payload }, notFound, payload.issuedAt + 3600)).toBe('NOT_FOUND');
  });
  it('other statuses pass through', () => {
    expect(dashboardStatus({ id, payload }, assess(payload, id, chain({ revoked: true }), 0), payload.issuedAt)).toBe('REVOKED');
  });
});
