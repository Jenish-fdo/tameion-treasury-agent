const { installSnap } = require('@metamask/snaps-jest');

// The bundle under test is built in DEMO mode: it never touches the network. The address's last hex digit picks the state.
const to = (digit) => `0x${'1'.repeat(39)}${digit}`;
const text = (ui) => JSON.stringify(ui);

describe('built Snap bundle (simulator)', () => {
  it('shows LOW / LIMITED / STRONGER insights for a native transfer, with no severity', async () => {
    const { onTransaction } = await installSnap();
    for (const [digit, title] of [['1', 'CREDENTIA / LOW TRUST'], ['7', 'CREDENTIA / LIMITED EVIDENCE'], ['f', 'CREDENTIA / STRONGER EVIDENCE']]) {
      const response = await onTransaction({ to: to(digit), value: '0x1', chainId: 'eip155:10143' });
      const ui = response.response.content ?? (await response.getInterface?.());
      expect(text(ui)).toContain(title);
      expect(text(ui)).toContain('DEMO DATA');
      expect(response.response).not.toHaveProperty('severity');
    }
  });

  it('is neutral for an unsupported network', async () => {
    const { onTransaction } = await installSnap();
    const response = await onTransaction({ to: to('1'), value: '0x1', chainId: 'eip155:1' });
    const ui = response.response.content ?? (await response.getInterface?.());
    expect(text(ui)).toContain('unavailable for this network');
  });

  it('answers the documented RPC methods and rejects unknown ones', async () => {
    const { request } = await installSnap();
    const version = await request({ method: 'credentia_getVersion', origin: 'https://dapp.example' });
    expect(version.response).toMatchObject({ result: { version: '0.1.0' } });
    const unknown = await request({ method: 'credentia_getIdentity', origin: 'https://dapp.example' });
    expect(unknown.response).toMatchObject({ error: { code: -32601 } });
    const bad = await request({ method: 'credentia_getTrustProfile', params: { address: '0x123' }, origin: 'https://dapp.example' });
    expect(bad.response).toMatchObject({ error: { code: -32602 } });
  });
});
