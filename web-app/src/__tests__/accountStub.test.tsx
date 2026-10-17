import { render, screen } from '@testing-library/react';
import { AccountButton } from '@/components/dc/AccountButton';
import { useAccount } from '@/components/account';

describe('temporary account stub', () => {
  it('is always signed out and has no signer', () => {
    const a = useAccount();
    expect(a).toMatchObject({ address: undefined, isConnected: false, signer: null, available: false });
  });

  it('renders a disabled placeholder that says why', () => {
    render(<AccountButton />);
    const button = screen.getByRole('button', { name: /Sign-in coming soon/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/Circle wallets/));
  });
});
