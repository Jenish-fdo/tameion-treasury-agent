import './ioStub';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/dc/StatusBadge';
import { FinalCta, HowItWorks, LandingHero, VerificationSection } from '@/components/dc/Landing';
import { SmoothScroll } from '@/components/dc/SmoothScroll';
import { IssueForm } from '@/components/dc/IssueForm';
import { VerifyView } from '@/components/dc/VerifyView';
import { STATUS_LABEL, encodePayload, idForPayload, type CredentialStatus, type SharePayload } from '@/lib/dc/credential';

// No account, chain or network in these tests (the account layer is a signed-out stub).
jest.mock('@/lib/arc', () => ({ arcChain: { id: 5042002, rpcUrls: { default: { http: ['http://localhost:0'] } } }, ARC_EXPLORER_URL: 'https://explorer.example', ARC_NETWORK_NAME: 'Arc Testnet', ARC_CHAIN_ID: 5042002, FAUCET_URL: 'https://faucet.example' }));
const mockLenis = jest.fn(() => ({ destroy: jest.fn() }));
jest.mock('lenis', () => ({ __esModule: true, default: function Lenis() { return mockLenis(); } }));

function setReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
}
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  setReducedMotion(false);
  mockLenis.mockClear();
  window.localStorage.clear();
});

describe('StatusBadge', () => {
  it.each(Object.keys(STATUS_LABEL) as CredentialStatus[])('%s is spelled out in words (not colour alone)', (s) => {
    render(<StatusBadge status={s} />);
    expect(screen.getByText(STATUS_LABEL[s])).toBeInTheDocument();
  });
});

describe('landing page content', () => {
  it('has the required copy, CTAs and the illustrative-data label', () => {
    render(<><LandingHero /><HowItWorks /><VerificationSection /><FinalCta /></>);
    expect(screen.getByRole('heading', { level: 1, name: 'A treasury agent you can audit.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issue a credential' })).toHaveAttribute('href', '/issue');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how-it-works');
    expect(screen.getByText('Three simple steps.')).toBeInTheDocument();
    expect(screen.getByText('Trust, verified in one click.')).toBeInTheDocument();
    expect(screen.getAllByText('Illustrative demo data').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: 'Issue credential' })).toHaveAttribute('href', '/issue');
    expect(screen.getByText(/early build on Arc testnet\. It is not audited and not ready for real funds/)).toBeInTheDocument();
    expect(screen.getByText(/The agent is not live yet/)).toBeInTheDocument();
  });
});

describe('smooth scrolling', () => {
  it('does not start under reduced motion', () => {
    setReducedMotion(true);
    render(<SmoothScroll />);
    expect(mockLenis).not.toHaveBeenCalled();
  });
  it('starts otherwise', () => {
    render(<SmoothScroll />);
    expect(mockLenis).toHaveBeenCalledTimes(1);
  });
});

describe('issue flow in demo mode (no registry configured)', () => {
  it('is not gated on any identity check: the button is enabled and no verification step is shown', async () => {
    wrap(<IssueForm />);
    expect(screen.getByRole('button', { name: 'Issue credential' })).toBeEnabled();
    expect(screen.queryByText(/Step 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CVI|Cleanverse/i)).not.toBeInTheDocument();
  });

  it('shows validation errors and sends nothing', async () => {
    wrap(<IssueForm />);
    expect(screen.getByText('Demo mode')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Issue credential' }));
    expect(await screen.findByText('Enter a credential title.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a full 0x/)).toBeInTheDocument();
  });

  it('issues a labelled DEMO credential with a link and QR, never VERIFIED', async () => {
    wrap(<IssueForm />);
    await userEvent.type(screen.getByLabelText('Credential title'), 'Certificate of Completion');
    await userEvent.type(screen.getByLabelText('Recipient name'), 'Alex Chen');
    await userEvent.type(screen.getByLabelText('Recipient wallet address'), '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    await userEvent.click(screen.getByRole('button', { name: 'Issue credential' }));
    expect(await screen.findByText('Demo credential created.')).toBeInTheDocument();
    expect(screen.getByText('It was not sent to Arc.')).toBeInTheDocument();
    expect(screen.getAllByText('DEMO · NOT ANCHORED').length).toBeGreaterThan(0);
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR code for the verification link' })).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText('Verification link') as HTMLInputElement).value).toMatch(/\/verify\/0x[0-9a-f]{64}\?d=/));
    expect(screen.getByRole('link', { name: 'View receipt' })).toHaveAttribute('href', expect.stringMatching(/^\/receipt\/0x/));
  });
});

describe('verify page without a configured registry', () => {
  const demo: SharePayload = {
    v: 1, title: 'Certificate of Completion', recipientName: 'Alex Chen', description: '', salt: '0x00112233445566778899aabbccddeeff',
    issuer: '0x000000000000000000000000000000000000dEaD', holder: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', expiry: 0, issuedAt: 1_800_000_000, demo: true,
  };

  it('a demo link says DEMO and never VERIFIED', async () => {
    wrap(<VerifyView id={idForPayload(demo)} d={encodePayload(demo)} />);
    expect(await screen.findByText('Credential check')).toBeInTheDocument();
    // The on-chain record panel and the receipt step say plainly that this is demo data.
    expect(await screen.findByText('Demo data · this browser only')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record a demo receipt' }));
    expect(await screen.findByText('Receipt recorded')).toBeInTheDocument();
    expect(await screen.findByText('Verification recorded: not valid')).toBeInTheDocument();
    expect(screen.getAllByText('DEMO · NOT ANCHORED').length).toBeGreaterThan(0);
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
  });

  it('a real-looking link with no registry configured says it cannot check, not verified', async () => {
    const real = { ...demo, demo: undefined };
    wrap(<VerifyView id={idForPayload(real)} d={encodePayload(real)} />);
    expect((await screen.findAllByText('CANNOT CHECK')).length).toBeGreaterThan(0);
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
  });

  it('an invalid ID is an alert, not a crash', () => {
    wrap(<VerifyView id="not-an-id" />);
    expect(screen.getByRole('alert')).toHaveTextContent('This is not a valid credential ID.');
  });
});
