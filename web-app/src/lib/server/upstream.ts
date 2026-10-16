import { NextResponse } from 'next/server';

// Server-only helper for read-only proxy routes. The backend API key never leaves the server.
const UPSTREAM_TIMEOUT_MS = 25_000;
const PASS_THROUGH = [400, 401, 403, 404, 429, 503];

const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status });

/** GET `<backend>/api/<version>${path}`; returns the JSON on success, or a sanitised status + error code. */
export async function proxyGet(path: string): Promise<NextResponse> {
  const apiKey = process.env.CREDENTIA_API_KEY?.trim();
  if (!apiKey) return fail(401, 'API_KEY_NOT_CONFIGURED');

  const base = (process.env.CREDENTIA_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const version = process.env.NEXT_PUBLIC_API_VERSION || 'v1';

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/${version}${path}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    return fail(502, 'UPSTREAM_UNREACHABLE');
  }

  if (upstream.ok) {
    try {
      return NextResponse.json(await upstream.json(), { status: 200 });
    } catch {
      return fail(502, 'UPSTREAM_INVALID_RESPONSE');
    }
  }
  let code = 'UPSTREAM_ERROR';
  try {
    const c = ((await upstream.json()) as { error?: { code?: unknown } })?.error?.code;
    if (typeof c === 'string' && /^[A-Z0-9_]{1,64}$/.test(c)) code = c;
  } catch {
    /* generic code */
  }
  return fail(PASS_THROUGH.includes(upstream.status) ? upstream.status : 502, code);
}
