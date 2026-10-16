import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCredentialPage from '@/app/credential/create/page';
import { addDays, prepareCredential, toDateInput, expiryError, credentialFormSchema } from '@/lib/credential-form';
import { keccak256, toBytes } from 'viem';

let mockAccount: { address?: string; isConnected: boolean } = { isConnected: false };
jest.mock('@/components/account', () => ({ useAccount: () => ({ ...mockAccount, connect: jest.fn(), busy: false }) }));
jest.mock('@/components/layout/header', () => ({ Header: () => null }));
jest.mock('@/components/layout/footer', () => ({ Footer: () => null }));

const WALLET = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SUBJECT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const inDays = (n: number) => toDateInput(addDays(new Date(), n));

async function fill({ subject = SUBJECT, date = inDays(30), uri = '', notes = '' } = {}) {
  await userEvent.type(screen.getByLabelText('Subject address'), subject);
  fireEvent.change(screen.getByLabelText('Expiration date'), { target: { value: date } });
  if (uri) await userEvent.type(screen.getByLabelText('Metadata URI (optional)'), uri);
  if (notes) await userEvent.type(screen.getByLabelText('Notes (optional)'), notes);
}
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Prepare credential' }));

beforeEach(() => {
  mockAccount = { isConnected: false };
});

describe('create credential page', () => {
  it('disconnected: explains why an account is needed, offers passkey sign-in, and disables preparing', () => {
    render(<CreateCredentialPage />);
    expect(screen.getByText('Viewing and checking profiles does not require an account. Issuing a credential does.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with passkey to prepare credential' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare credential' })).toBeDisabled();
  });

  it('states plainly that issuance is not configured or broadcast', () => {
    render(<CreateCredentialPage />);
    expect(screen.getByRole('note')).toHaveTextContent('Testnet issuance is not configured in this deployment. This screen demonstrates the credential preparation flow.');
    expect(screen.getByText('Private local note — not stored on-chain.')).toBeInTheDocument();
    expect(screen.getByText('A JSON file with additional credential details.')).toBeInTheDocument();
  });

  it('connected: prepares an unsigned request, never a tx hash or credential id, and sends nothing', async () => {
    mockAccount = { address: WALLET, isConnected: true };
    render(<CreateCredentialPage />);
    await fill({ uri: 'https://example.com/meta.json', notes: 'my private note' });
    await submit();

    expect(await screen.findByText('UNSIGNED / NOT BROADCAST')).toBeInTheDocument();
    const preview = within(screen.getByText('Prepared credential').closest('section') as HTMLElement);
    expect(preview.getByText(WALLET)).toBeInTheDocument();
    expect(preview.getByText(SUBJECT)).toBeInTheDocument();
    expect(preview.getByText('Identity Verification')).toBeInTheDocument();
    expect(preview.getByText(keccak256(toBytes('https://example.com/meta.json')))).toBeInTheDocument();
    expect(preview.getByText(/Now: Prepared/)).toBeInTheDocument();
    for (const later of ['Awaiting wallet signature', 'Submitted to testnet', 'Confirmed on testnet']) {
      expect(preview.getByText(new RegExp(`Not reached: ${later}`))).toBeInTheDocument();
    }
    expect(preview.getByText(/no transaction hash or credential ID/)).toBeInTheDocument();
    expect(screen.queryByText(/my private note/)).not.toBeInTheDocument(); // notes stay local
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('validates the subject address, expiry range and metadata URI', async () => {
    mockAccount = { address: WALLET, isConnected: true };
    render(<CreateCredentialPage />);
    await fill({ subject: '0x123', date: inDays(-1), uri: 'ftp://nope' });
    await submit();
    expect(await screen.findByText('Enter a valid 0x… address (42 characters).')).toBeInTheDocument();
    expect(screen.getByText('Use an ipfs:// or https:// link, or leave this empty.')).toBeInTheDocument();
    expect(screen.queryByText('UNSIGNED / NOT BROADCAST')).not.toBeInTheDocument();
  });

  it.each([[-1, 'The expiration date cannot be in the past.'], [366, 'The expiration date can be at most one year from today.']])(
    'expiry %i days from today is rejected', async (days, message) => {
      mockAccount = { address: WALLET, isConnected: true };
      render(<CreateCredentialPage />);
      await fill({ date: inDays(days) });
      await submit();
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
  );

  it('requires a name for the Custom type and uses it in the preparation', async () => {
    mockAccount = { address: WALLET, isConnected: true };
    render(<CreateCredentialPage />);
    await userEvent.selectOptions(screen.getByLabelText('Credential type'), 'Custom');
    await fill();
    await submit();
    expect(await screen.findByText('Name the custom credential type.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Custom type name'), 'Event Staff');
    await submit();
    const preview = within((await screen.findByText('Prepared credential')).closest('section') as HTMLElement);
    expect(preview.getByText('Event Staff')).toBeInTheDocument();
  });
});

describe('credential-form helpers', () => {
  it('accepts today and exactly one year, rejects either side', () => {
    const today = new Date(2026, 5, 15);
    expect(expiryError('2026-06-15', today)).toBeNull();
    expect(expiryError('2027-06-15', today)).toBeNull();
    expect(expiryError('2026-06-14', today)).toMatch(/past/);
    expect(expiryError('2027-06-16', today)).toMatch(/one year/);
  });

  it('prepares a deterministic request that omits notes', () => {
    const values = credentialFormSchema.parse({ subject: SUBJECT, credentialType: 'KYC Passed', expiresOn: '2027-01-01', metadataUri: '', notes: 'secret' });
    const prepared = prepareCredential(values, WALLET);
    expect(prepared).toEqual({
      issuer: WALLET, subject: SUBJECT, credentialType: 'KYC Passed', credentialTypeHash: keccak256(toBytes('KYC Passed')),
      expiryTimestamp: Date.UTC(2027, 0, 1, 23, 59, 59) / 1000, metadataUri: null, dataHash: null,
    });
    expect(JSON.stringify(prepared)).not.toContain('secret');
  });
});
