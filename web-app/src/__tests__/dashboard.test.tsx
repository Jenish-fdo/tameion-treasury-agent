import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '@/app/trust-dashboard/page';
import { profileStatus, scoreExplanation } from '@/components/dashboard/TrustDossierView';
import { ADDR, credRaw, expired, mockRoutes, trustRaw } from './apiMock';

jest.mock('@/components/layout/header', () => ({ Header: () => null }));
jest.mock('@/components/layout/footer', () => ({ Footer: () => null }));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DashboardPage />
    </QueryClientProvider>
  );
const lookup = async (value = ADDR) => {
  await userEvent.type(screen.getByRole('textbox', { name: 'Look up a trust profile' }), value);
  await userEvent.click(screen.getByRole('button', { name: 'Open case file' }));
};
const loaded = { '/api/trust-score/': { status: 200, body: trustRaw() }, '/api/agent-credentials/': { status: 200, body: { credentials: [credRaw(), credRaw({ credentialId: `0x${'cd'.repeat(32)}`, ...expired })], trustScore: 72 } } };

describe('dashboard', () => {
  it('starts with an empty "no case open" state and needs no wallet or request', () => {
    renderPage();
    expect(screen.getByText('Enter an address to open its evidence file.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('explains what is happening while the case file loads', async () => {
    globalThis.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderPage();
    await lookup();
    expect(await screen.findByRole('status')).toHaveTextContent('Opening the case file for this address');
    expect(screen.getAllByTestId('case-skeleton').length).toBeGreaterThan(0);
  });

  it('rejects an invalid address before any request', async () => {
    renderPage();
    await lookup('0x123');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a full 0x… address');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('shows the trust dossier: score, status, explanation, breakdown with weights, and credentials', async () => {
    const fetchMock = mockRoutes(loaded);
    renderPage();
    await lookup();
    expect(await screen.findByTestId('trust-score')).toHaveTextContent('72');
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('Stronger evidence available; continue with normal caution')).toBeInTheDocument();
    expect(screen.getByText(/A summary of available credentials and activity signals/)).toBeInTheDocument();
    for (const [label, weight] of [['Active credentials', '40%'], ['Attestations', '35%'], ['Staked AUSD', '25%']]) {
      expect(screen.getByText(label).closest('li')).toHaveTextContent(weight);
    }
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 credentials
    expect(screen.getByText('No payment history is available for this demo profile.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([`/api/agent-credentials/${ADDR}`, `/api/trust-score/${ADDR}`]);
  });

  it('only offers actions that exist: mint, check payment (no stake or dispute)', async () => {
    mockRoutes(loaded);
    renderPage();
    await lookup();
    await screen.findByTestId('trust-score');
    expect(screen.getByRole('link', { name: 'Mint credential' })).toHaveAttribute('href', '/credential/create');
    expect(screen.getByRole('link', { name: 'Check a payment' })).toHaveAttribute('href', '/payment-check');
    expect(screen.queryByRole('button', { name: /stake|dispute/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /stake|dispute/i })).not.toBeInTheDocument();
  });

  it('filters credentials and opens an accessible detail dialog that Escape closes', async () => {
    mockRoutes(loaded);
    renderPage();
    await lookup();
    await screen.findByTestId('trust-score');

    await userEvent.click(screen.getByRole('button', { name: 'Expired' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Revoked' }));
    expect(screen.getByText('No revoked credentials.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    await userEvent.click(screen.getAllByRole('button', { name: /Open credential/ })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Credential detail' });
    expect(within(dialog).getByRole('link', { name: 'Open verification page' })).toHaveAttribute('href', expect.stringContaining('/credential/verify/0x'));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['an address that was never scored and has no credentials', { '/api/trust-score/': { status: 200, body: trustRaw({ score: 0, scoreBps: 0, lastUpdated: 0 }) }, '/api/agent-credentials/': { status: 200, body: { credentials: [], trustScore: 0 } } }],
    ['a 404 from the service', { '/api/trust-score/': { status: 404, body: {} }, '/api/agent-credentials/': { status: 404, body: {} } }],
  ])('shows the not-found state for %s', async (_name, routes) => {
    mockRoutes(routes);
    renderPage();
    await lookup();
    expect(await screen.findByText('No Credentia evidence file exists for this address yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('trust-score')).not.toBeInTheDocument();
  });

  it('shows an empty credential state for a scored address with no credentials', async () => {
    mockRoutes({ ...loaded, '/api/agent-credentials/': { status: 200, body: { credentials: [], trustScore: 72 } } });
    renderPage();
    await lookup();
    expect(await screen.findByText('No credentials have been issued to this address through Credentia.')).toBeInTheDocument();
    expect(screen.getByText('LIMITED HISTORY')).toBeInTheDocument();
  });

  it('shows a friendly error and never raw server text', async () => {
    mockRoutes({ '/api/trust-score/': { status: 500, body: { error: { code: 'X', message: 'stack trace secret-key' } } }, '/api/agent-credentials/': { status: 500, body: {} } });
    renderPage();
    await lookup();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Risk check unavailable');
    expect(alert).not.toHaveTextContent(/stack trace|secret-key/);
  });

  it('loads a clearly labelled illustrative profile without any request', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Or load an illustrative demo profile' }));
    expect(screen.getAllByText(/ILLUSTRATIVE DEMO DATA/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('trust-score')).toHaveTextContent('72');
    await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled());
  });

  it('has a "What am I looking at?" help panel', () => {
    renderPage();
    expect(screen.getByText('What am I looking at?')).toBeInTheDocument();
  });
});

describe('dashboard helpers', () => {
  it.each([[0, 'Limited evidence or elevated concerns'], [30, 'Limited evidence or elevated concerns'], [31, 'Some evidence available; verify before paying'], [60, 'Some evidence available; verify before paying'], [61, 'Stronger evidence available; continue with normal caution'], [100, 'Stronger evidence available; continue with normal caution']])(
    'score %i -> %s', (score, text) => expect(scoreExplanation(score)).toBe(text)
  );

  it('derives the profile status', () => {
    const profile = { address: ADDR, score: 50, lastUpdated: 5, factors: [] };
    const active = { credentialId: 'x', issuer: 'i', subject: 's', credentialType: null, issuedAt: 1, expiresAt: 0, isRevoked: false, metadataUri: null };
    expect(profileStatus(profile, [active])).toBe('VERIFIED');
    expect(profileStatus(profile, [{ ...active, isRevoked: true }])).toBe('LIMITED HISTORY');
    expect(profileStatus({ ...profile, score: 0, lastUpdated: 0 }, [])).toBe('UNVERIFIED');
  });
});
