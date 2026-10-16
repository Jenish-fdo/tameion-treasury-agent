'use client';

import { useId, useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { InvalidAmountError, parseAmountToWei } from '@/lib/api';
import { cn } from '@/lib/utils';

/** What the form hands to its parent: the amount is already converted to a wei integer string. */
export interface PaymentIntentValues {
  to: string;
  amount: string;
  token: string;
  context: string;
}

interface FormState {
  to: string;
  amount: string;
  token: string;
  context: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const MAX_CONTEXT = 2000;
const TOKEN_PATTERN = /^(0x[0-9a-fA-F]{40}|[A-Za-z0-9._-]{1,32})$/;

/** Illustrative test values only: not real people, not real fraud cases. */
export const DEMO_SAMPLES: Record<'safe' | 'suspicious', FormState> = {
  safe: {
    to: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    amount: '12.50',
    token: 'AUSD',
    context: 'Payment for invoice #42: two hours of GPU compute, as agreed in the signed service order.',
  },
  suspicious: {
    to: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    amount: '25000',
    token: 'AUSD',
    context: 'URGENT: send now to unlock your wallet and claim the guaranteed 10x airdrop. Do not tell anyone or the offer is lost.',
  },
};

const EMPTY: FormState = { to: '', amount: '', token: 'AUSD', context: '' };

function validate(values: FormState): { errors: Errors; parsed?: PaymentIntentValues } {
  const errors: Errors = {};
  const to = values.to.trim();
  const token = values.token.trim();
  const context = values.context.trim();

  if (!isAddress(to)) errors.to = 'Enter a valid 0x… address (mixed-case addresses must have a correct checksum).';
  if (!TOKEN_PATTERN.test(token)) errors.token = 'Use a token symbol such as AUSD, or a token contract address.';
  if (!context) errors.context = 'Describe the payment so it can be assessed.';
  else if (context.length > MAX_CONTEXT) errors.context = `Keep the description under ${MAX_CONTEXT} characters.`;

  let amount = '';
  try {
    amount = parseAmountToWei(values.amount);
  } catch (err) {
    errors.amount = err instanceof InvalidAmountError ? err.message : 'Enter a valid amount.';
  }
  return Object.keys(errors).length > 0 ? { errors } : { errors, parsed: { to, amount, token, context } };
}

interface Props {
  onSubmit: (values: PaymentIntentValues) => void;
  isLoading?: boolean;
  /** Shown as "Sending from"; the parent supplies the real `from` address. */
  fromLabel?: string;
}

export function PaymentIntentForm({ onSubmit, isLoading = false, fromLabel }: Props) {
  const [values, setValues] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const ids = { to: useId(), amount: useId(), token: useId(), context: useId() };

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const load = (sample: FormState) => {
    setValues(sample);
    setErrors({});
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const { errors: found, parsed } = validate(values);
    setErrors(found);
    if (parsed) onSubmit(parsed);
  };

  const field = (key: keyof FormState) => ({
    id: ids[key],
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${ids[key]}-error` : undefined,
    className: cn('input', errors[key] && 'border-stop'),
  });
  const error = (key: keyof FormState) =>
    errors[key] ? (
      <p id={`${ids[key]}-error`} role="alert" className="mt-1 text-sm text-stop">
        {errors[key]}
      </p>
    ) : null;

  const tokenLabel = values.token.trim() || 'AUSD';

  return (
    <form onSubmit={handleSubmit} noValidate className="card space-y-5" aria-label="Payment details">
      {fromLabel && <p className="text-sm text-ink-soft">Sending from: <span className="font-mono">{fromLabel}</span></p>}

      <div>
        <label htmlFor={ids.to} className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Recipient address</label>
        <input {...field('to')} value={values.to} onChange={set('to')} placeholder="0x…" autoComplete="off" spellCheck={false} />
        {error('to')}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.amount} className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Amount ({tokenLabel})</label>
          <input {...field('amount')} value={values.amount} onChange={set('amount')} placeholder="12.50" inputMode="decimal" autoComplete="off" />
          {error('amount')}
        </div>
        <div>
          <label htmlFor={ids.token} className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Token</label>
          <input {...field('token')} value={values.token} onChange={set('token')} autoComplete="off" spellCheck={false} />
          {error('token')}
        </div>
      </div>

      <div>
        <label htmlFor={ids.context} className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Transaction context / payment description</label>
        <textarea
          {...field('context')}
          className={cn(field('context').className, 'h-28 py-2')}
          value={values.context}
          onChange={set('context')}
          maxLength={MAX_CONTEXT + 200}
          placeholder="What is this payment for?"
        />
        <div className="mt-1 flex justify-between text-xs text-ink-soft">
          <span>{error('context') ? '' : 'Amounts are converted exactly to 18-decimal units before sending.'}</span>
          <span>{values.context.length}/{MAX_CONTEXT}</span>
        </div>
        {error('context')}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="submit" className="btn-primary" disabled={isLoading}>
          {isLoading ? 'Analyzing…' : 'Analyze payment risk'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => load(DEMO_SAMPLES.safe)} disabled={isLoading}>
          Load safe demo
        </button>
        <button type="button" className="btn-secondary" onClick={() => load(DEMO_SAMPLES.suspicious)} disabled={isLoading}>
          Load suspicious demo
        </button>
      </div>
      <p className="text-xs text-ink-soft">Demo samples are made-up test values, not real users or real fraud cases.</p>
    </form>
  );
}
