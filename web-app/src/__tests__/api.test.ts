import { InvalidAmountError, PaymentCheckError, checkPayment, normalizeResult, parseAmountToWei } from '@/lib/api';
import { jsonResponse, rawResult } from './testUtils';

const request = { from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', to: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', amount: '1', token: 'AUSD', context: 'x' };

describe('parseAmountToWei (18 decimals, exact)', () => {
  it('converts 12.50 AUSD to the correct wei string', () => {
    expect(parseAmountToWei('12.50')).toBe('12500000000000000000');
  });

  it.each([
    ['1', '1000000000000000000'],
    ['0.000000000000000001', '1'],
    ['  7.5  ', '7500000000000000000'],
    ['0.1', '100000000000000000'], // a float would give 100000000000000020
    ['123456789.123456789012345678', '123456789123456789012345678'],
    ['9007199254740993', '9007199254740993000000000000000000'], // beyond Number.MAX_SAFE_INTEGER
  ])('%s -> %s', (input, wei) => {
    expect(parseAmountToWei(input)).toBe(wei);
  });

  it('respects other decimals', () => {
    expect(parseAmountToWei('12.50', 6)).toBe('12500000');
  });

  it.each(['', '   ', '0', '0.0', '-1', '+1', 'abc', '1e18', '1,5', '.5', '5.', '1.2.3', '0x10', '1.0000000000000000001', '9'.repeat(70)])(
    'rejects %j',
    (input) => {
      expect(() => parseAmountToWei(input)).toThrow(InvalidAmountError);
    }
  );
});

describe('normalizeResult (fail closed)', () => {
  it('maps a backend payload to the UI shape, with failed models as NEUTRAL', () => {
    const result = normalizeResult(rawResult('REVIEW'));
    expect(result).toMatchObject({ verdict: 'REVIEW', isSafeToProceed: false, confidence: 87.5, agreement: 0.63, cached: false });
    expect(result.modelResults.map((m) => [m.model, m.verdict])).toEqual([['kimi', 'GO'], ['qwen', 'STOP'], ['jev', 'NEUTRAL']]);
    expect(result.modelResults[2]).toMatchObject({ confidence: 0, latencyMs: 8000, reasoning: 'This model did not respond in time.' });
  });

  it('grants permission only for isSafeToProceed === true AND verdict GO', () => {
    expect(normalizeResult(rawResult('GO')).isSafeToProceed).toBe(true);
    for (const flag of [undefined, false, 'true', 1, null]) {
      expect(normalizeResult(rawResult('GO', { isSafeToProceed: flag })).isSafeToProceed).toBe(false);
    }
    expect(normalizeResult(rawResult('STOP', { isSafeToProceed: true })).isSafeToProceed).toBe(false);
    expect(normalizeResult(rawResult('REVIEW', { isSafeToProceed: true })).isSafeToProceed).toBe(false);
  });

  it('always returns the three models, in order, even if the server omits some', () => {
    const result = normalizeResult(rawResult('GO', { modelResults: [rawResult('GO').modelResults[1]] }));
    expect(result.modelResults.map((m) => m.model)).toEqual(['kimi', 'qwen', 'jev']);
    expect(result.modelResults[0].verdict).toBe('NEUTRAL');
    expect(result.modelResults[1].verdict).toBe('GO');
  });

  it('clamps out-of-range numbers and tolerates garbage fields', () => {
    const result = normalizeResult(rawResult('GO', { confidence: 900, agreement: -4, flags: ['A', 5, null], recommendedAction: undefined }));
    expect(result).toMatchObject({ confidence: 100, agreement: 0, flags: ['A'] });
    expect(result.recommendedAction).toMatch(/Do not send/);
  });

  it.each([null, 'GO', [], {}, { verdict: 'MAYBE' }, { verdict: 'go' }])('rejects an unrecognisable payload: %j', (raw) => {
    expect(() => normalizeResult(raw)).toThrow(PaymentCheckError);
  });
});

describe('checkPayment', () => {
  it('POSTs to the same-origin proxy and returns the normalised result', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, rawResult('GO')));
    const result = await checkPayment(request, { fetchImpl });
    expect(result.isSafeToProceed).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/payment-check');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(request);
    expect(init.headers).not.toHaveProperty('x-api-key'); // the browser never holds the key
  });

  it.each([
    [400, {}, 'validation'],
    [401, {}, 'auth'],
    [403, {}, 'auth'],
    [429, {}, 'rate_limit'],
    [503, { error: { code: 'INSUFFICIENT_AI_MODELS' } }, 'insufficient_models'],
    [503, { error: { code: 'SOMETHING_ELSE' } }, 'service'],
    [500, { error: { code: 'INTERNAL_ERROR' } }, 'service'],
    [502, {}, 'service'],
  ])('HTTP %i %j -> %s', async (status, body, kind) => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(status, body));
    await expect(checkPayment(request, { fetchImpl })).rejects.toMatchObject({ kind, status });
  });

  it('maps a network failure to "network" and exposes no raw error text', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1:3001 secret-token'));
    const error = await checkPayment(request, { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(PaymentCheckError);
    expect(error.kind).toBe('network');
    expect(error.message).toBe('network');
    expect(JSON.stringify(error)).not.toContain('secret-token');
  });

  it('treats an unreadable success body as a service error', async () => {
    const bad = { ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } } as unknown as Response;
    await expect(checkPayment(request, { fetchImpl: jest.fn().mockResolvedValue(bad) })).rejects.toMatchObject({ kind: 'service' });
  });

  it('rethrows the abort when the caller cancels', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(checkPayment(request, { fetchImpl, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses the (blocked) global fetch by default, which proves tests cannot reach the network', async () => {
    await expect(checkPayment(request)).rejects.toMatchObject({ kind: 'network' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/payment-check');
  });
});
