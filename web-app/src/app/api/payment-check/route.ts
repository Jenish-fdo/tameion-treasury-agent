import { NextResponse } from 'next/server';
import { z } from 'zod';

// Server-only proxy to the Credentia backend. It exists so the backend API key stays on the server
// (anything NEXT_PUBLIC_* is shipped to every visitor's browser).
//   CREDENTIA_API_URL  backend origin (falls back to NEXT_PUBLIC_API_URL, then http://localhost:3001)
//   CREDENTIA_API_KEY  one of the backend's API_KEYS / PRO_API_KEYS. Never NEXT_PUBLIC_.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UPSTREAM_TIMEOUT_MS = 55_000;

const bodySchema = z
  .object({
    from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    amount: z.string().regex(/^\d{1,78}$/),
    token: z.string().regex(/^(0x[0-9a-fA-F]{40}|[A-Za-z0-9._-]{1,32})$/),
    context: z.string().max(2000),
  })
  .strict();

/** Sanitised error envelope: a stable code only, never upstream text. */
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status });

export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.CREDENTIA_API_KEY?.trim();
  if (!apiKey) return fail(401, 'API_KEY_NOT_CONFIGURED');

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
  } catch {
    return fail(400, 'VALIDATION_ERROR');
  }

  const base = (process.env.CREDENTIA_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const version = process.env.NEXT_PUBLIC_API_VERSION || 'v1';

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/${version}/intent/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
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

  // Pass through only the status and the backend's error *code*; drop messages, details and ids.
  let code = 'UPSTREAM_ERROR';
  try {
    const body: unknown = await upstream.json();
    const c = (body as { error?: { code?: unknown } })?.error?.code;
    if (typeof c === 'string' && /^[A-Z0-9_]{1,64}$/.test(c)) code = c;
  } catch {
    /* keep the generic code */
  }
  // Only statuses the UI knows how to explain are passed through; anything else becomes a generic 502.
  const status = [400, 401, 403, 429, 503].includes(upstream.status) ? upstream.status : 502;
  return fail(status, code);
}
