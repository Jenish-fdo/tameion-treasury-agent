import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsensusResultCard } from '@/components/ConsensusResultCard';
import { normalizeResult } from '@/lib/api';
import { rawResult } from './testUtils';

const renderResult = (raw: object) => render(<ConsensusResultCard result={normalizeResult(raw)} />);
const continueButton = () => screen.getByRole('button', { name: 'Continue to payment (demo)' });

describe('ConsensusResultCard', () => {
  it('GO: green "Safe to proceed" and the demo continue button is enabled', async () => {
    renderResult(rawResult('GO'));
    expect(screen.getByTestId('verdict-headline')).toHaveTextContent('Safe to proceed');
    expect(screen.getByRole('region', { name: 'Payment risk result' }).firstElementChild).toHaveClass('bg-go-soft');
    expect(continueButton()).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Verdict: CLEARED / GO' })).toBeInTheDocument();
    expect(screen.getByText('In plain words:').parentElement).toHaveTextContent('Safe to proceed');

    await userEvent.click(continueButton());
    expect(screen.getByRole('status')).toHaveTextContent('Payment flow intentionally disabled in this hackathon demo.');
  });

  it('STOP: red "Payment blocked" and the continue button is disabled', async () => {
    renderResult(rawResult('STOP'));
    expect(screen.getByTestId('verdict-headline')).toHaveTextContent('Payment blocked — elevated risk detected.');
    expect(screen.getByRole('region').firstElementChild).toHaveClass('bg-stop-soft');
    expect(continueButton()).toBeDisabled();
    expect(screen.getByRole('img', { name: 'Verdict: BLOCKED / STOP' })).toBeInTheDocument();
    expect(screen.getByText('In plain words:').parentElement).toHaveTextContent('Do not send');
    await userEvent.click(continueButton());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('REVIEW: yellow "Manual review required" and the continue button is disabled', () => {
    renderResult(rawResult('REVIEW'));
    expect(screen.getByTestId('verdict-headline')).toHaveTextContent('Manual review required — do not send yet.');
    expect(screen.getByRole('region').firstElementChild).toHaveClass('bg-review-soft');
    expect(continueButton()).toBeDisabled();
    expect(screen.getByRole('img', { name: 'Verdict: HOLD / REVIEW' })).toBeInTheDocument();
    expect(screen.getByText('In plain words:').parentElement).toHaveTextContent('Pause and verify manually');
  });

  it('isSafeToProceed is the source of truth: a GO verdict without it stays blocked', () => {
    renderResult(rawResult('GO', { isSafeToProceed: false, confidence: 99, agreement: 1 }));
    expect(continueButton()).toBeDisabled();
    expect(screen.getByTestId('verdict-headline')).toHaveTextContent('Manual review required');
  });

  it('high confidence and agreement never unlock a STOP', () => {
    renderResult(rawResult('STOP', { confidence: 100, agreement: 1 }));
    expect(continueButton()).toBeDisabled();
  });

  it('shows verdict, confidence out of 100, agreement as a percentage and the recommended action', () => {
    renderResult(rawResult('REVIEW'));
    expect(screen.getByText('Final verdict').closest('div')).toHaveTextContent('REVIEW');
    expect(screen.getAllByText('Confidence')[0].closest('div')).toHaveTextContent('88/100'); // first match = the summary stat
    expect(screen.getByText('Agreement').closest('div')).toHaveTextContent('63%');
    expect(screen.getByText('Do not send this payment.')).toBeInTheDocument();
  });

  it('explains confidence and agreement in tooltips', () => {
    renderResult(rawResult('GO'));
    expect(screen.getByRole('button', { name: 'About confidence' })).toHaveAccessibleDescription('How strongly the available models assessed the result.');
    expect(screen.getByRole('button', { name: 'About agreement' })).toHaveAccessibleDescription('How much weighted model support the verdict received.');
  });

  it('renders one card per model with verdict, confidence, reasoning and latency', () => {
    renderResult(rawResult('REVIEW'));
    const kimi = screen.getByRole('article', { name: 'Kimi verdict' });
    expect(kimi).toHaveTextContent('GO');
    expect(kimi).toHaveTextContent('88/100');
    expect(kimi).toHaveTextContent('Looks like a normal invoice payment.');
    expect(kimi).toHaveTextContent('Response time: 420 ms');
    expect(screen.getByRole('article', { name: 'Qwen verdict' })).toHaveTextContent('STOP');
    const jev = screen.getByRole('article', { name: 'Jev verdict' });
    expect(jev).toHaveTextContent('No answer');
    expect(jev).toHaveTextContent('did not respond in time');
    expect(jev).toHaveTextContent('Response time: 8.0 s');
  });

  it('lists risk flags in plain language, and renders model text as text (no HTML injection)', () => {
    const raw = rawResult('REVIEW', { flags: ['PROMPT_INJECTION_SUSPECTED'] });
    (raw.modelResults[0] as unknown as { reasoning: string }).reasoning = '<img src=x onerror=alert(1)> hi';
    const { container } = renderResult(raw);
    expect(screen.getByRole('note', { name: 'Risk flags' })).toHaveTextContent('looks like an attempt to instruct the AI models');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> hi/)).toBeInTheDocument();
  });

  it('always shows the safety disclaimer below the results', () => {
    renderResult(rawResult('GO'));
    expect(screen.getByText('Credentia provides explainable AI risk signals before a payment. It does not guarantee transaction safety.')).toBeInTheDocument();
  });

  it('mentions when a result was served from cache', () => {
    renderResult(rawResult('GO', { cached: true }));
    expect(screen.getByText(/Served from a recent identical check/)).toBeInTheDocument();
  });
});
