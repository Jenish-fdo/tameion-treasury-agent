import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom does not provide these, and viem needs them at import time.
Object.assign(globalThis, { TextEncoder, TextDecoder });

// Tests must never reach the network (and so never the backend or an AI provider). Every test
// starts with a `fetch` that rejects; a test that needs a response must set one up explicitly.
beforeEach(() => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network access is disabled in tests')) as unknown as typeof fetch;
});
