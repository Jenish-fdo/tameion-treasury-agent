import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom does not provide these, and viem needs them at import time.
Object.assign(globalThis, { TextEncoder, TextDecoder });

// The account layer is a Mera passkey. Tests never run a WebAuthn ceremony or derive a key: the module is
// replaced with one that reports "no passkey" and refuses to open a session.
jest.mock('@/lib/mera', () => ({
  hasRememberedPasskey: () => false,
  forgetPasskey: () => {},
  createPasskeyAccount: () => Promise.reject(new Error('Passkeys are disabled in tests')),
  unlockPasskeyAccount: () => Promise.reject(new Error('Passkeys are disabled in tests')),
  passkeyErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Passkey sign-in failed.'),
}));

// Tests must never reach the network (and so never the backend or an AI provider). Every test
// starts with a `fetch` that rejects; a test that needs a response must set one up explicitly.
beforeEach(() => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network access is disabled in tests')) as unknown as typeof fetch;
});
