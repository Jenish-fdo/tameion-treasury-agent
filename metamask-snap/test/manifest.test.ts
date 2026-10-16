import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(readFileSync(path.join(__dirname, '../snap.manifest.json'), 'utf8'));
const perms = manifest.initialPermissions as Record<string, unknown>;

describe('snap.manifest.json', () => {
  it('requests exactly the permissions the code uses', () => {
    expect(Object.keys(perms).sort()).toEqual(['endowment:network-access', 'endowment:rpc', 'endowment:transaction-insight']);
  });
  it('transaction insight does not request the transaction origin (the code never reads it)', () => {
    expect(perms['endowment:transaction-insight']).toEqual({});
  });
  it('RPC is for dapps only (not other Snaps)', () => {
    expect(perms['endowment:rpc']).toEqual({ dapps: true, snaps: false });
  });
  it('requests nothing about storage, dialogs, notifications, keys, accounts, signing or an Ethereum provider', () => {
    for (const banned of ['snap_manageState', 'snap_dialog', 'snap_notify', 'endowment:ethereum-provider', 'snap_getBip32Entropy', 'snap_getBip44Entropy', 'snap_getEntropy', 'endowment:keyring', 'endowment:cronjob', 'endowment:lifecycle-hooks']) {
      expect(perms).not.toHaveProperty(banned);
    }
  });
  it('describes itself without trust or safety claims', () => {
    expect(String(manifest.description).toLowerCase()).not.toMatch(/trusted|guaranteed safe|fraud-free/);
    expect(manifest.description).toMatch(/does not block transactions or guarantee safety/);
  });
  it('uses the supported platform version and points at the built bundle', () => {
    expect(manifest.platformVersion).toBe('12.0.1');
    expect(manifest.source.location.npm.filePath).toBe('dist/bundle.js');
  });
});
