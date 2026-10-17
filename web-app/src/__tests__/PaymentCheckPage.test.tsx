import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentCheckPage from '@/app/payment-check/page';
import { jsonResponse, rawResult } from './testUtils';

let mockAddress: string | undefined;
jest.mock('@/components/account', () => ({ useAccount: () => ({ address: mockAddress }) }));
jest.mock('@/components/layout/header', () => ({ Header: () => null }));
jest.mock('@/components/layout/footer', () => ({ Footer: () => null }));

const fetchMock = () => globalThis.fetch as unknown as jest.Mock;
const analyzeButton = () => screen.getByRole('button', { name: /Analyze payment risk|Analyzing/ });

async function loadSafeDemoAndAnalyze() {
  await userEvent.click(screen.getByRole('button', { name: 'Load safe demo' }));
  await userEvent.click(analyzeButton());
}

beforeEach(() => {
  mockAddress = undefined;
});

describe('Payment Risk Check page', () => {
  it('starts idle with the form and both demo buttons', () => {
    render(<PaymentCheckPage />);
    expect(screen.getByRole('heading', { name: 'Payment Risk Check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load safe demo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load suspicious demo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toHaveValue('AUSD');
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('shows the loading message and three model skeletons while analysing', async () => {
    fetchMock().mockReturnValue(new Promise(() => {})); // never resolves
    render(<PaymentCheckPage />);
    await loadSafeDemoAndAnalyze();

    expect(await screen.findByText('Credentia is checking this payment with three independent risk models…')).toBeInTheDocument();
    expect(screen.getAllByTestId('case-skeleton')).toHaveLength(3);
    for (const name of ['Kimi', 'Qwen', 'Jev']) expect(screen.getByText(`${name} report`)).toBeInTheDocument();
    expect(analyzeButton()).toBeDisabled();
  });

  it('GO result: sends the exact wei amount to the proxy and enables the demo continue button', async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, rawResult('GO')));
    render(<PaymentCheckPage />);
    await loadSafeDemoAndAnalyze();

    const continueBtn = await screen.findByRole('button', { name: 'Continue to payment (demo)' });
    expect(continueBtn).toBeEnabled();
    expect(screen.getByTestId('verdict-headline')).toHaveTextContent('Safe to proceed');

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/payment-check'); // never a provider or backend URL
    expect(JSON.parse(init.body)).toEqual({
      from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // demo sender: no wallet connected
      to: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      amount: '12500000000000000000', // 12.50 AUSD, 18 decimals
      token: 'AUSD',
      context: expect.stringContaining('invoice #42'),
    });
  });

  it('uses the signed-in account as the sender', async () => {
    mockAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    fetchMock().mockResolvedValue(jsonResponse(200, rawResult('GO')));
    render(<PaymentCheckPage />);
    expect(screen.getByText(/your account/)).toBeInTheDocument();
    await loadSafeDemoAndAnalyze();
    await screen.findByTestId('verdict-headline');
    expect(JSON.parse(fetchMock().mock.calls[0][1].body).from).toBe(mockAddress);
  });

  it('STOP result for the suspicious demo keeps the continue button disabled', async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, rawResult('STOP')));
    render(<PaymentCheckPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Load suspicious demo' }));
    await userEvent.click(analyzeButton());
    expect(await screen.findByTestId('verdict-headline')).toHaveTextContent('Payment blocked');
    expect(screen.getByRole('button', { name: 'Continue to payment (demo)' })).toBeDisabled();
    expect(JSON.parse(fetchMock().mock.calls[0][1].body).amount).toBe('25000000000000000000000');
  });

  it('REVIEW result keeps the continue button disabled', async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, rawResult('REVIEW')));
    render(<PaymentCheckPage />);
    await loadSafeDemoAndAnalyze();
    expect(await screen.findByTestId('verdict-headline')).toHaveTextContent('Manual review required');
    expect(screen.getByRole('button', { name: 'Continue to payment (demo)' })).toBeDisabled();
  });

  it.each([
    [400, {}, 'Check the payment details'],
    [401, {}, 'Risk check is not authorised'],
    [429, {}, 'Too many checks'],
    [503, { error: { code: 'INSUFFICIENT_AI_MODELS' } }, 'Not enough AI models available'],
    [500, { error: { code: 'INTERNAL_ERROR', message: 'stack trace at db.js:12 secret-key-123' } }, 'Risk check unavailable'],
  ])('HTTP %i shows a friendly message and never raw server text', async (status, body, title) => {
    fetchMock().mockResolvedValue(jsonResponse(status, body));
    render(<PaymentCheckPage />);
    await loadSafeDemoAndAnalyze();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading')).toHaveTextContent(title);
    expect(alert).not.toHaveTextContent(/stack trace|secret-key|db\.js/);
    expect(screen.queryByRole('button', { name: 'Continue to payment (demo)' })).not.toBeInTheDocument();
  });

  it('network failure shows a friendly message', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch https://internal.example:3001'));
    render(<PaymentCheckPage />);
    await loadSafeDemoAndAnalyze();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't reach the service");
    expect(alert).not.toHaveTextContent('internal.example');
  });

  it('does not call the API when the form is invalid, and explains what to fix', async () => {
    render(<PaymentCheckPage />);
    await userEvent.type(screen.getByLabelText('Recipient address'), '0x123');
    await userEvent.type(screen.getByLabelText(/Amount/), '1.5e3');
    await userEvent.click(analyzeButton());
    expect(await screen.findByText(/Enter a valid 0x/)).toBeInTheDocument();
    expect(screen.getByText(/Enter a positive number/)).toBeInTheDocument();
    expect(screen.getByText(/Describe the payment/)).toBeInTheDocument();
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
