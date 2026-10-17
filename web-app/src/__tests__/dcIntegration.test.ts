/** @jest-environment node */
// Logic behind the integration layers: reputation, the copilot's context and its route.
import type { Address } from 'viem';
import { GET, POST } from '@/app/api/copilot/route';
import { checksFor } from '@/lib/dc/checks';
import { buildCopilotContext } from '@/lib/dc/copilot-context';
import type { CopilotContext } from '@/lib/dc/copilot-types';
import { assess, hashRecord, idForPayload, typeHash, type SharePayload } from '@/lib/dc/credential';
import { reputationParts, reputationScore } from '@/lib/dc/reputation';

jest.mock('@/lib/monad', () => ({ monadTestnet: { id: 10143, rpcUrls: { default: { http: ['http://localhost:0'] } } } }));

const NOW = 1_800_000_000;

describe('issuer reputation score', () => {
  it('is zero with no activity and capped at 100', () => {
    expect(reputationScore({ issued: 0, revoked: 0, checks: 0 })).toBe(0);
    expect(reputationScore({ issued: 500, revoked: 0, checks: 500 })).toBe(100);
  });

  it('rewards activity and verification, and penalises revocations', () => {
    const clean = reputationScore({ issued: 10, revoked: 0, checks: 5 });
    expect(clean).toBe(20 + 15 + 30);
    expect(reputationScore({ issued: 10, revoked: 5, checks: 5 })).toBe(clean - 15);
    expect(reputationParts({ issued: 1, revoked: 0, checks: 0 }).map((p) => p.max)).toEqual([40, 30, 30]);
  });
});

const payload: SharePayload = {
  v: 1, title: 'Certificate of Completion', recipientName: 'Alex Chen', description: 'Finished the workshop.', salt: '0x00112233445566778899aabbccddeeff',
  issuer: '0x1111111111111111111111111111111111111111' as Address, holder: '0x2222222222222222222222222222222222222222' as Address,
  expiry: 0, issuedAt: NOW - 60,
};

function context(over: Partial<SharePayload> = {}): CopilotContext {
  const p = { ...payload, ...over };
  const id = idForPayload(p);
  const chain = p.demo ? undefined : { issuer: p.issuer, holder: p.holder, credentialType: typeHash(p.title), dataHash: hashRecord(p), issuedAt: p.issuedAt, expiryTimestamp: 0, revoked: false };
  const assessment = assess(p, id, chain, NOW);
  return buildCopilotContext({
    id, payload: p, chain, assessment, checks: checksFor(assessment, true),
    insight: { source: 'envio', verificationCount: 2, history: [{ kind: 'CHECKED', actor: p.holder, valid: true, timestamp: NOW - 30 }], issuer: { address: p.issuer, issued: 4, revoked: 1, checks: 2, score: 63 } },
  });
}

describe('copilot context', () => {
  it('carries the page’s own verdict, checks and indexed record, and nothing else', () => {
    const c = context();
    expect(c.verification.status).toBe('VERIFIED');
    expect(c.verification.checks).toHaveLength(4);
    expect(c.issuer).not.toHaveProperty('cviStatus');
    expect(c.issuer.record).toEqual({ issued: 4, revoked: 1, verificationsRecorded: 2, reputationScore: 63 });
    expect(c.issuer.recordSource).toMatch(/Envio/);
    expect(c.activity[0]).toMatchObject({ event: 'Verification recorded', result: 'valid' });
    expect(c.credential.network).toMatch(/Monad testnet/);
  });

  it('a demo credential is described as never anchored', () => {
    const c = context({ demo: true });
    expect(c.verification.status).toBe('DEMO · NOT ANCHORED');
    expect(c.credential.network).toMatch(/never anchored/);
  });
});

describe('/api/copilot', () => {
  const post = (body: unknown) => POST(new Request('http://localhost/api/copilot', { method: 'POST', body: JSON.stringify(body) }));
  const provider = (message: unknown) => ({ ok: true, json: async () => ({ choices: [{ message }] }) });
  const callTool = (name: string, args: unknown, id = 'c1') => ({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

  afterEach(() => {
    delete process.env.MOONSHOT_API_KEY;
  });

  it('reports itself offline and refuses requests when no key is configured', async () => {
    expect(await (await GET()).json()).toMatchObject({ configured: false });
    const res = await post({ task: 'draft', idea: 'x' });
    expect(res.status).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed requests before contacting the provider', async () => {
    process.env.MOONSHOT_API_KEY = 'test-key';
    expect((await post({ task: 'nope' })).status).toBe(400);
    expect((await post({ task: 'ask', question: 'q', context: {} })).status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('answers a verifier question from tool results: the page’s data goes to the model, never invented facts', async () => {
    process.env.MOONSHOT_API_KEY = 'test-key';
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(provider(callTool('get_verification_result', {})))
      .mockResolvedValueOnce(provider({ role: 'assistant', content: 'It matches the registry record.' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await post({ task: 'ask', question: 'Is this authentic?', context: context() });
    expect(await res.json()).toEqual({ text: 'It matches the registry record.' });

    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: { role: string; content: string }[] };
    const toolMessage = second.messages.find((m) => m.role === 'tool');
    expect(JSON.parse(toolMessage!.content)).toMatchObject({ status: 'VERIFIED' });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer test-key');
  });

  it('returns a clipped, structured draft for issuers', async () => {
    process.env.MOONSHOT_API_KEY = 'test-key';
    globalThis.fetch = jest.fn().mockResolvedValueOnce(
      provider(callTool('submit_credential_draft', { title: 'T'.repeat(200), description: 'Attests completion.', criteria: ['Attended', 'Passed', 3, ''] })),
    ) as unknown as typeof fetch;

    const body = (await (await post({ task: 'draft', idea: 'a course certificate' })).json()) as { draft: { title: string; criteria: string[] } };
    expect(body.draft.title).toHaveLength(80);
    expect(body.draft.criteria).toEqual(['Attended', 'Passed']);
  });

  it('turns a provider failure into a plain message without leaking details', async () => {
    process.env.MOONSHOT_API_KEY = 'test-key';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const res = await post({ task: 'summarize', context: context() });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'The copilot is unavailable right now.' });
  });
});
