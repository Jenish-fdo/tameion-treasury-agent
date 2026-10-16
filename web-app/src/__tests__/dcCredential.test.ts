import { keccak256, toBytes, type Address, type Hex } from 'viem';
import {
  assess, computeCredentialId, decodePayload, encodePayload, expiryToUnix, formSchema, hashRecord, idForPayload, randomSalt, typeHash,
  type OnChainCredential, type SharePayload,
} from '@/lib/dc/credential';

const ISSUER = '0x1111111111111111111111111111111111111111' as Address;
const HOLDER = '0x2222222222222222222222222222222222222222' as Address;
const NOW = 1_800_000_000;

const payload = (over: Partial<SharePayload> = {}): SharePayload => ({
  v: 1, title: 'Certificate of Completion', recipientName: 'Alex Chen', description: 'Finished the course.',
  salt: '0x00112233445566778899aabbccddeeff', issuer: ISSUER, holder: HOLDER, expiry: 0, issuedAt: NOW - 100, ...over,
});
const chainFor = (p: SharePayload, over: Partial<OnChainCredential> = {}): OnChainCredential => ({
  issuer: p.issuer, holder: p.holder, credentialType: typeHash(p.title), dataHash: hashRecord(p), issuedAt: p.issuedAt, expiryTimestamp: p.expiry, revoked: false, ...over,
});

describe('credential ID', () => {
  it('uses the same formula as CredentialRegistry._computeCredentialId (vector computed with `cast`)', () => {
    // cast keccak $(cast abi-encode --packed "f(address,address,bytes32,bytes32)" ISSUER HOLDER keccak("Certificate of Completion") 0xabab…ab)
    const dataHash = `0x${'ab'.repeat(32)}` as Hex;
    expect(typeHash('Certificate of Completion')).toBe('0xe09cb34f249eb73aee26bf0044e95ae8f7e589b1096c4c01fb971b62549773b9');
    expect(computeCredentialId(ISSUER, HOLDER, 'Certificate of Completion', dataHash)).toBe(
      '0xfa78792386bdf15ffaf0654ef88e974a75b0ee44e8eff802211635c617bf359d'
    );
  });

  it('commits to every field of the record', () => {
    const base = idForPayload(payload());
    expect(idForPayload(payload({ recipientName: 'Alex Chen ' }))).not.toBe(base);
    expect(idForPayload(payload({ description: 'x' }))).not.toBe(base);
    expect(idForPayload(payload({ salt: '0x00112233445566778899aabbccddeef0' }))).not.toBe(base);
    expect(idForPayload(payload({ title: 'Other' }))).not.toBe(base);
    expect(idForPayload(payload({ holder: ISSUER }))).not.toBe(base);
  });

  it('hashes the canonical JSON array of the record', () => {
    const p = payload();
    expect(hashRecord(p)).toBe(keccak256(toBytes(JSON.stringify([1, p.title, p.recipientName, p.description, p.salt]))));
  });

  it('salts differ between credentials', () => {
    expect(randomSalt()).not.toBe(randomSalt());
    expect(randomSalt()).toMatch(/^0x[0-9a-f]{32}$/);
  });
});

describe('share payload', () => {
  it('round-trips, including non-ASCII text', () => {
    const p = payload({ recipientName: 'Zoë 陈', tx: `0x${'cd'.repeat(32)}` });
    expect(decodePayload(encodePayload(p))).toEqual(p);
  });

  it.each([undefined, '', 'not-base64!!', encodePayload(payload()).slice(0, 20), 'e30'])('rejects malformed input %p', (raw) => {
    expect(decodePayload(raw)).toBeNull();
  });

  it('rejects structurally valid JSON with bad fields and oversized input', () => {
    const bad = encodePayload({ ...payload(), holder: 'nope' as Address });
    expect(decodePayload(bad)).toBeNull();
    expect(decodePayload('a'.repeat(5000))).toBeNull();
  });
});

describe('assess: what a verifier is told', () => {
  const p = payload();
  const id = idForPayload(p);

  it('VERIFIED only when the link details match the chain and the credential is active', () => {
    expect(assess(p, id, chainFor(p), NOW).status).toBe('VERIFIED');
  });
  it('VERIFIED without a payload still verifies the on-chain facts, and says no details were compared', () => {
    const a = assess(null, id, chainFor(p), NOW);
    expect(a.status).toBe('VERIFIED');
    expect(a.detail).toMatch(/no personal details/);
  });
  it('flags edited details as MISMATCH, never VERIFIED', () => {
    const edited = payload({ recipientName: 'Mallory' });
    expect(assess(edited, id, chainFor(p), NOW).status).toBe('MISMATCH');
  });
  it('flags a link whose ID does not match its payload', () => {
    expect(assess(p, `0x${'00'.repeat(32)}`, chainFor(p), NOW).status).toBe('MISMATCH');
  });
  it('flags an on-chain holder that differs from the link', () => {
    expect(assess(p, id, chainFor(p, { holder: ISSUER }), NOW).status).toBe('MISMATCH');
  });
  it('REVOKED beats everything after a match', () => {
    expect(assess(p, id, chainFor(p, { revoked: true }), NOW).status).toBe('REVOKED');
  });
  it('EXPIRED when the chain expiry has passed; a future expiry stays VERIFIED', () => {
    expect(assess(p, id, chainFor(p, { expiryTimestamp: NOW - 1 }), NOW).status).toBe('EXPIRED');
    expect(assess(p, id, chainFor(p, { expiryTimestamp: NOW + 1000 }), NOW).status).toBe('VERIFIED');
  });
  it('NOT_FOUND when the registry has no record; UNAVAILABLE when it cannot be read', () => {
    expect(assess(p, id, null, NOW).status).toBe('NOT_FOUND');
    expect(assess(p, id, undefined, NOW).status).toBe('UNAVAILABLE');
  });
  it('a demo credential is never VERIFIED, even if the chain "matches"', () => {
    const demo = payload({ demo: true });
    expect(assess(demo, idForPayload(demo), chainFor(demo), NOW).status).toBe('DEMO');
  });
});

describe('issue form schema', () => {
  const ok = { title: 'T', recipientName: 'N', holder: HOLDER, description: '', expiryDate: '' };
  it('accepts a minimal valid form', () => expect(formSchema.safeParse(ok).success).toBe(true));
  it.each([
    ['title', { title: '  ' }],
    ['recipientName', { recipientName: '' }],
    ['holder', { holder: '0x123' }],
    ['description', { description: 'x'.repeat(281) }],
    ['expiryDate', { expiryDate: '2001-01-01' }],
    ['expiryDate', { expiryDate: 'soon' }],
  ])('rejects bad %s', (field, over) => {
    const r = formSchema.safeParse({ ...ok, ...over });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it('expiry covers the whole chosen day (UTC)', () => {
    expect(expiryToUnix('2030-01-05')).toBe(Date.parse('2030-01-05T23:59:59Z') / 1000);
    expect(expiryToUnix('')).toBe(0);
  });
});

import { checksFor } from '@/lib/dc/checks';
import type { CredentialStatus } from '@/lib/dc/credential';

describe('checksFor: why a status was given', () => {
  const a = (status: CredentialStatus) => ({ status, detail: '' });
  const states = (s: CredentialStatus, hasPayload = true) => checksFor(a(s), hasPayload).map((c) => c.state);

  it('VERIFIED passes all four checks', () => expect(states('VERIFIED')).toEqual(['pass', 'pass', 'pass', 'pass']));
  it('MISMATCH fails only the details check', () => expect(states('MISMATCH')).toEqual(['pass', 'pass', 'fail', 'skip']));
  it('REVOKED and EXPIRED fail only the active check', () => {
    expect(states('REVOKED')).toEqual(['pass', 'pass', 'pass', 'fail']);
    expect(states('EXPIRED')).toEqual(['pass', 'pass', 'pass', 'fail']);
  });
  it('NOT_FOUND and UNAVAILABLE fail the registry check and skip the rest', () => {
    expect(states('NOT_FOUND')).toEqual(['pass', 'fail', 'skip', 'skip']);
    expect(states('UNAVAILABLE')).toEqual(['pass', 'fail', 'skip', 'skip']);
  });
  it('DEMO skips the registry and never passes "still active"', () => expect(states('DEMO')).toEqual(['pass', 'skip', 'skip', 'skip']));
  it('with no details attached, the details check is skipped even when verified', () => expect(states('VERIFIED', false)).toEqual(['pass', 'pass', 'skip', 'pass']));
});
