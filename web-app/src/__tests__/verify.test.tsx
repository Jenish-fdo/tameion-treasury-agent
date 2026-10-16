import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyCredentialPage from '@/app/credential/verify/[id]/page';
import { CRED_ID, credRaw, expired, mockRoutes } from './apiMock';

jest.mock('@/components/layout/header', () => ({ Header: () => null }));
jest.mock('@/components/layout/footer', () => ({ Footer: () => null }));

const renderPage = (id = CRED_ID) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VerifyCredentialPage params={{ id }} />
    </QueryClientProvider>
  );
const api = (status: number, body: unknown) => mockRoutes({ [`/api/credential/${CRED_ID}`]: { status, body } });

describe('credential verification page (public)', () => {
  it('shows a valid credential with every field, and says it does not make a payment safe', async () => {
    api(200, credRaw());
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Looking up this credential');
    expect(await screen.findByText('VALID')).toBeInTheDocument();
    expect(screen.getByText(CRED_ID)).toBeInTheDocument();
    expect(screen.getByText('KYC Passed')).toBeInTheDocument();
    expect(screen.getByText(/does not by itself mean a payment is safe/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check payment risk' })).toHaveAttribute('href', '/payment-check');
    expect(screen.getByRole('button', { name: 'Copy verification link' })).toBeInTheDocument();
  });

  it('shows EXPIRED and REVOKED distinctly (revoked wins)', async () => {
    api(200, credRaw(expired));
    const { unmount } = renderPage();
    expect(await screen.findByText('EXPIRED')).toBeInTheDocument();
    unmount();
    api(200, credRaw({ isRevoked: true, ...expired }));
    renderPage();
    expect(await screen.findByText('REVOKED')).toBeInTheDocument();
    expect(screen.getByText(/Do not rely on it/)).toBeInTheDocument();
  });

  it('shows NOT FOUND for an unknown credential, and a friendly error for service failures', async () => {
    api(404, {});
    const { unmount } = renderPage();
    expect(await screen.findByText('No credential with this ID exists.')).toBeInTheDocument();
    unmount();
    api(502, {});
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Risk check unavailable');
  });

  it('rejects a malformed id without any request', () => {
    renderPage('0x1234');
    expect(screen.getByText('This is not a valid credential ID.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('only makes https metadata links clickable', async () => {
    api(200, credRaw({ metadataUri: 'https://example.com/meta.json' }));
    const { unmount } = renderPage();
    expect(await screen.findByRole('link', { name: 'https://example.com/meta.json' })).toHaveAttribute('rel', 'noopener noreferrer');
    unmount();
    for (const bad of ['javascript:alert(1)', 'ipfs://bafy123', 'http://insecure.example.com/x']) {
      api(200, credRaw({ metadataUri: bad }));
      const view = renderPage();
      await screen.findByText('VALID');
      expect(screen.queryByRole('link', { name: bad })).not.toBeInTheDocument();
      expect(screen.getByText(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
      view.unmount();
    }
  });

  it('copies the verification link', async () => {
    api(200, credRaw());
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Copy verification link' }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText('Link copied.')).toBeInTheDocument();
  });
});
