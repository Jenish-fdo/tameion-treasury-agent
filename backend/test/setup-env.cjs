// Runs before each test file. Lets config load without real credentials, keeps logs quiet, and
// isolates tests from a developer's backend/.env (dotenv never overrides variables already set).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.ALLOW_NO_AUTH_FOR_TESTS = 'true';
for (const name of [
  'API_KEYS', 'PRO_API_KEYS',
  'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL',
  'QWEN_API_KEY', 'QWEN_BASE_URL', 'QWEN_MODEL',
  'JEV_API_KEY', 'JEV_BASE_URL', 'JEV_MODEL',
  'CREDENTIAL_REGISTRY_ADDRESS', 'TRUST_SCORE_ADDRESS', 'ISSUER_PRIVATE_KEYS', 'BACKEND_WALLET_PRIVATE_KEY',
]) {
  process.env[name] = '';
}
// Tests must never reach the network (and so never a real AI provider). Anything that needs
// `fetch` must inject a fake or `jest.spyOn(globalThis, 'fetch')`; otherwise this throws.
globalThis.fetch = async () => {
  throw new Error('Network access is disabled in tests: inject or mock fetch');
};
