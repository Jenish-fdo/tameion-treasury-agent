import { safeHttpsUrl } from '@/lib/chain';

describe('safeHttpsUrl', () => {
  it('allows only plain https URLs', () => {
    expect(safeHttpsUrl('https://example.com/a.json')).toBe('https://example.com/a.json');
    for (const bad of ['http://example.com', 'javascript:alert(1)', 'ipfs://x', 'https://user:pw@example.com', 'not a url', '', null]) {
      expect(safeHttpsUrl(bad)).toBeNull();
    }
  });
});
