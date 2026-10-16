import { credentialStatus, normalizeCredential, normalizeCredentialList, normalizeTrustProfile, PaymentCheckError } from '@/lib/api';
import { safeHttpsUrl } from '@/lib/chain';
import { credRaw, trustRaw } from './apiMock';

describe('credentialStatus', () => {
  const now = 1_800_000_000;
  it('revoked beats expired beats active; 0 means no expiry', () => {
    expect(credentialStatus({ isRevoked: true, expiresAt: now + 100 }, now)).toBe('revoked');
    expect(credentialStatus({ isRevoked: true, expiresAt: now - 100 }, now)).toBe('revoked');
    expect(credentialStatus({ isRevoked: false, expiresAt: now - 1 }, now)).toBe('expired');
    expect(credentialStatus({ isRevoked: false, expiresAt: now }, now)).toBe('expired');
    expect(credentialStatus({ isRevoked: false, expiresAt: now + 1 }, now)).toBe('active');
    expect(credentialStatus({ isRevoked: false, expiresAt: 0 }, now)).toBe('active');
  });
});

describe('response normalisation', () => {
  it('maps the trust profile and its three factors', () => {
    const p = normalizeTrustProfile(trustRaw());
    expect(p.score).toBe(72);
    expect(p.factors.map((f) => [f.key, f.points, f.weightBps])).toEqual([['credentials', 80, 4000], ['attestations', 65, 3500], ['staking', 62, 2500]]);
  });

  it('rejects malformed addresses, ids and shapes', () => {
    expect(() => normalizeTrustProfile(trustRaw({ address: 'nope' }))).toThrow(PaymentCheckError);
    expect(() => normalizeTrustProfile({})).toThrow(PaymentCheckError);
    expect(() => normalizeCredential(credRaw({ credentialId: '0x12' }))).toThrow(PaymentCheckError);
    expect(() => normalizeCredentialList({ credentials: 'x' })).toThrow(PaymentCheckError);
  });

  it('keeps unknown optional fields null rather than inventing values', () => {
    const c = normalizeCredential({ ...credRaw(), credentialType: undefined, metadataUri: undefined });
    expect(c.credentialType).toBeNull();
    expect(c.metadataUri).toBeNull();
  });
});

describe('safeHttpsUrl', () => {
  it('allows only plain https URLs', () => {
    expect(safeHttpsUrl('https://example.com/a.json')).toBe('https://example.com/a.json');
    for (const bad of ['http://example.com', 'javascript:alert(1)', 'ipfs://x', 'https://user:pw@example.com', 'not a url', '', null]) {
      expect(safeHttpsUrl(bad)).toBeNull();
    }
  });
});
