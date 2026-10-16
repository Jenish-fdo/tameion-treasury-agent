/**
 * Checks how the three AI providers are configured, and optionally smoke-tests them.
 *
 *   npm run check:ai-providers                              # configuration only, NO network calls
 *   RUN_AI_PROVIDER_SMOKE_TEST=true npm run check:ai-providers   # also sends one tiny request per configured provider
 *
 * Safety: reads environment variables only (backend/.env is loaded into the environment first).
 * It prints variable NAMES and HTTP status codes, never key values, headers, request bodies or
 * provider error bodies (response bodies are not even read). Exit code is non-zero only when a
 * requested smoke test fails for a configured provider.
 */
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface ProviderSpec {
  name: 'Kimi' | 'Qwen' | 'Jev';
  keyVar: string;
  baseVar: string;
  modelVar: string;
  keyRequired: boolean;
  /** Mirrors the runtime default in src/config/index.ts. */
  defaultBase?: string;
}

const SPECS: ProviderSpec[] = [
  { name: 'Kimi', keyVar: 'KIMI_API_KEY', baseVar: 'KIMI_BASE_URL', modelVar: 'KIMI_MODEL', keyRequired: true, defaultBase: 'https://api.moonshot.ai/v1' },
  { name: 'Qwen', keyVar: 'QWEN_API_KEY', baseVar: 'QWEN_BASE_URL', modelVar: 'QWEN_MODEL', keyRequired: true },
  { name: 'Jev', keyVar: 'JEV_API_KEY', baseVar: 'JEV_BASE_URL', modelVar: 'JEV_MODEL', keyRequired: false },
];

const SMOKE_TIMEOUT_MS = 8000;
/** TypeSafe's own API is `POST /v1/systemone` (typed decisions), not OpenAI-style chat completions. */
const TYPESAFE_DIRECT_HOSTS = new Set(['api.typesafe.ai']);

export interface ProviderRow {
  Provider: string;
  Configured: 'yes' | 'no';
  'Base URL present': 'yes' | 'no';
  'Model configured': 'yes' | 'no';
  'Smoke test': 'skipped' | 'success' | 'failed';
  'HTTP status': string;
  Notes: string;
}

const yn = (b: boolean): 'yes' | 'no' => (b ? 'yes' : 'no');
const val = (env: Env, name: string): string => (env[name] ?? '').trim();

function parseBase(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

const isLocal = (u: URL): boolean => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);

/** Maps a status code to a fixed, safe sentence; provider response bodies are never shown. */
function summarizeStatus(status: number): string {
  if (status === 401 || status === 403) return 'authentication rejected (check the API key and that it matches this base URL/region)';
  if (status === 404) return 'endpoint or model not found (check base URL and model ID)';
  if (status === 400 || status === 422) return 'request rejected (check the model ID)';
  if (status === 429) return 'rate limited or out of quota';
  if (status >= 500) return 'provider server error';
  if (status >= 300 && status < 400) return 'unexpected redirect';
  return 'unexpected response';
}

async function smokeTest(
  spec: ProviderSpec, base: URL, apiKey: string, model: string, fetchImpl: FetchLike
): Promise<Pick<ProviderRow, 'Smoke test' | 'HTTP status' | 'Notes'>> {
  if (spec.name === 'Jev' && TYPESAFE_DIRECT_HOSTS.has(base.hostname)) {
    return {
      'Smoke test': 'skipped',
      'HTTP status': '-',
      Notes: 'direct TypeSafe API is not OpenAI-compatible (it uses /v1/systemone); point JEV_BASE_URL at an OpenAI-compatible gateway or add an adapter',
    };
  }
  if (base.protocol !== 'https:' && !isLocal(base)) {
    return { 'Smoke test': 'failed', 'HTTP status': '-', Notes: 'refusing to send credentials over plain http to a non-local host' };
  }
  try {
    const res = await fetchImpl(`${base.toString().replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
      redirect: 'error',
    });
    await res.body?.cancel(); // the body is never read
    return res.ok
      ? { 'Smoke test': 'success', 'HTTP status': String(res.status), Notes: '' }
      : { 'Smoke test': 'failed', 'HTTP status': String(res.status), Notes: summarizeStatus(res.status) };
  } catch (err) {
    const name = (err as Error | undefined)?.name;
    const notes = name === 'TimeoutError' || name === 'AbortError' ? `timed out after ${SMOKE_TIMEOUT_MS / 1000}s` : 'network error (DNS, connection, TLS or redirect)';
    return { 'Smoke test': 'failed', 'HTTP status': '-', Notes: notes };
  }
}

export interface CheckResult {
  rows: ProviderRow[];
  /** True when a requested smoke test failed for a configured provider. */
  failed: boolean;
}

/** Pure(ish) core: inspects `env`, and calls `fetchImpl` only when `runSmoke` is true. */
export async function checkProviders(env: Env, runSmoke: boolean, fetchImpl: FetchLike): Promise<CheckResult> {
  const rows: ProviderRow[] = [];
  let failed = false;

  for (const spec of SPECS) {
    const apiKey = val(env, spec.keyVar);
    const baseRaw = val(env, spec.baseVar) || spec.defaultBase || '';
    const model = val(env, spec.modelVar);
    const base = baseRaw ? parseBase(baseRaw) : null;

    const missing: string[] = [];
    if (spec.keyRequired && !apiKey) missing.push(spec.keyVar);
    if (!base) missing.push(baseRaw ? `${spec.baseVar} (not a valid URL)` : spec.baseVar);
    if (!model) missing.push(spec.modelVar);
    const configured = missing.length === 0;

    const row: ProviderRow = {
      Provider: spec.name,
      Configured: yn(configured),
      'Base URL present': yn(base !== null),
      'Model configured': yn(model !== '' ),
      'Smoke test': 'skipped',
      'HTTP status': '-',
      Notes: configured ? '' : `missing: ${missing.join(', ')}`,
    };

    if (runSmoke && configured && base) {
      Object.assign(row, await smokeTest(spec, base, apiKey, model, fetchImpl));
      if (row['Smoke test'] === 'failed') failed = true;
    } else if (runSmoke && !configured) {
      row.Notes = `${row.Notes}; smoke test skipped`;
    }
    rows.push(row);
  }
  return { rows, failed };
}

async function main(): Promise<void> {
  dotenv.config();
  const runSmoke = process.env.RUN_AI_PROVIDER_SMOKE_TEST === 'true';
  const { rows, failed } = await checkProviders(process.env, runSmoke, (input, init) => fetch(input, init));

  console.table(rows);
  console.log(
    runSmoke
      ? 'Smoke tests ran (one tiny request per configured provider).'
      : 'Configuration check only - no network calls were made. Set RUN_AI_PROVIDER_SMOKE_TEST=true to smoke-test configured providers.'
  );
  if (failed) {
    console.error('At least one configured provider failed its smoke test.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Never print the error: it could carry request details.
    console.error('check-ai-providers failed unexpectedly.');
    process.exitCode = 1;
  });
}
