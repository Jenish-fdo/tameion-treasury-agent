import { InvalidUsdcError, REASON_TEXT, TreasuryApiError, baseUnitsToUsdc, categoryLabel, errorText, riskLabel, treasuryFetch, usdcToBaseUnits } from '@/lib/treasury';
import { jsonResponse } from './testUtils';

describe('usdcToBaseUnits', () => {
  it.each([
    ['250', '250000000'],
    ['250.5', '250500000'],
    ['0.000001', '1'],
    ['1,000.25', '1000250000'],
    [' 12 ', '12000000'],
    ['123456789012345678901234', '123456789012345678901234000000'],
  ])('%s -> %s', (input, out) => {
    expect(usdcToBaseUnits(input)).toBe(out);
  });

  it.each(['', 'abc', '-5', '1e6', '1.2345678', '12.', '.5', '0x10', '1 000'])('rejects %j', (input) => {
    expect(() => usdcToBaseUnits(input)).toThrow(InvalidUsdcError);
  });

  it('rejects zero unless allowed', () => {
    expect(() => usdcToBaseUnits('0')).toThrow(InvalidUsdcError);
    expect(usdcToBaseUnits('0', { allowZero: true })).toBe('0');
    expect(usdcToBaseUnits('0.00', { allowZero: true })).toBe('0');
  });
});

describe('baseUnitsToUsdc', () => {
  it.each([
    ['0', '0.00'],
    ['1', '0.000001'],
    ['1000000', '1.00'],
    ['12500000', '12.50'],
    ['1234567890', '1,234.56789'],
    ['1000000000000', '1,000,000.00'],
  ])('%s -> %s', (input, out) => {
    expect(baseUnitsToUsdc(input)).toBe(out);
  });
  it('leaves anything that is not a plain integer untouched', () => {
    expect(baseUnitsToUsdc('abc')).toBe('abc');
  });
});

describe('labels', () => {
  it('maps ids and tiers to words, and falls back to the raw value', () => {
    expect(categoryLabel('VENDOR_INVOICE')).toBe('Vendor invoice');
    expect(categoryLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(riskLabel(2)).toBe('High');
    expect(riskLabel(9)).toBe('9');
  });
  it('explains every reason the contract can give', () => {
    for (const r of ['NONE', 'UNKNOWN_MANDATE', 'REVOKED', 'CONSUMED', 'EXPIRED', 'WRONG_AGENT', 'ZERO_AMOUNT', 'CATEGORY_NOT_ALLOWED', 'RECIPIENT_NOT_ALLOWED',
      'RISK_TIER_TOO_HIGH', 'OVER_PER_TX_LIMIT', 'OVER_DAILY_CAP', 'OVER_WEEKLY_CAP', 'OVER_MONTHLY_CAP', 'PAYMENT_ALREADY_USED']) {
      expect(REASON_TEXT[r]).toBeTruthy();
    }
  });
});

describe('treasuryFetch', () => {
  const stub = (impl: () => Promise<unknown>) => {
    globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
    return globalThis.fetch as jest.Mock;
  };

  it('calls the same-origin proxy and returns the JSON', async () => {
    const f = stub(async () => jsonResponse(200, { ok: 1 }));
    await expect(treasuryFetch('mandates?businessId=0x1')).resolves.toEqual({ ok: 1 });
    expect(f.mock.calls[0][0]).toBe('/api/backend/mandates?businessId=0x1');
    expect(f.mock.calls[0][1].method).toBe('GET');
  });

  it('sends a JSON body on POST', async () => {
    const f = stub(async () => jsonResponse(201, { id: 1 }));
    await treasuryFetch('/mandates', { method: 'POST', body: { a: 1 } });
    expect(f.mock.calls[0][0]).toBe('/api/backend/mandates');
    expect(f.mock.calls[0][1].body).toBe('{"a":1}');
    expect(f.mock.calls[0][1].headers['content-type']).toBe('application/json');
  });

  it('turns an error envelope into a TreasuryApiError with the code and field hints', async () => {
    stub(async () => jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'perTxLimit', message: 'must rise' }, { nope: 1 }] } }));
    const err: any = await treasuryFetch('mandates', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(TreasuryApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual([{ field: 'perTxLimit', message: 'must rise' }]);
    expect(errorText(err)).toBe('Request validation failed: perTxLimit must rise');
  });

  it('reports a network failure and an unreadable reply in plain words', async () => {
    stub(async () => { throw new Error('boom'); });
    const net: any = await treasuryFetch('x').catch((e) => e);
    expect(net.code).toBe('NETWORK');
    expect(errorText(net)).toMatch(/Could not reach the server/);

    stub(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    const bad: any = await treasuryFetch('x').catch((e) => e);
    expect(bad.code).toBe('BAD_RESPONSE');
  });

  it('never shows raw error objects', () => {
    expect(errorText(new Error('secret rpc url'))).toBe('Something went wrong. Nothing was changed.');
  });
});
