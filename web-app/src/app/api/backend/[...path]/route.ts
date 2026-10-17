import { NextResponse } from 'next/server';

// Same-origin proxy to the Credentia backend for the founder and agent screens, so the API key stays on the server
// (anything NEXT_PUBLIC_* is shipped to every visitor's browser). It only forwards the few routes those screens use.
//   CREDENTIA_API_URL  backend origin (falls back to NEXT_PUBLIC_API_URL, then http://localhost:3001)
//   CREDENTIA_API_KEY  one of the backend's API_KEYS / PRO_API_KEYS. Never NEXT_PUBLIC_.
// ARC TESTNET ONLY. The backend acts for managed demo owners; see PHASE3_PLAN.md.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UPSTREAM_TIMEOUT_MS = 55_000;
const MAX_BODY_BYTES = 20_000;
const ID = '0x[0-9a-fA-F]{64}';

/** Exactly the routes the screens use. Notably absent: POST /decisions (agents write those with their own credentials). */
const ALLOWED: { method: 'GET' | 'POST'; path: RegExp }[] = [
  { method: 'GET', path: /^businesses\/owners$/ },
  { method: 'GET', path: new RegExp(`^businesses/${ID}$`) },
  { method: 'POST', path: /^businesses$/ },
  { method: 'GET', path: /^mandates$/ },
  { method: 'GET', path: new RegExp(`^mandates/${ID}$`) },
  { method: 'POST', path: /^mandates$/ },
  { method: 'POST', path: new RegExp(`^mandates/${ID}/(revoke|validate|pay)$`) },
  { method: 'GET', path: /^decisions$/ },
  { method: 'GET', path: new RegExp(`^decisions/${ID}$`) },
  { method: 'GET', path: /^approvals\/pending$/ },
];
const SEGMENT = /^[A-Za-z0-9_.-]{1,80}$/;
const QUERY = /^\?[A-Za-z0-9_=&.%-]{0,400}$/;
const PASS_THROUGH_STATUS = new Set([400, 403, 404, 409, 429, 503]);

/** Sanitised error envelope: only a code, a message and field-level validation hints; never upstream text beyond that. */
const fail = (status: number, code: string, message: string, details?: unknown) =>
  NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });

async function forward(method: 'GET' | 'POST', request: Request, params: { path: string[] }): Promise<NextResponse> {
  const segments = params.path ?? [];
  if (segments.length === 0 || segments.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) return fail(404, 'NOT_FOUND', 'Not found');
  const path = segments.join('/');
  if (!ALLOWED.some((a) => a.method === method && a.path.test(path))) return fail(404, 'NOT_FOUND', 'Not found');

  const apiKey = process.env.CREDENTIA_API_KEY?.trim();
  if (!apiKey) return fail(503, 'API_KEY_NOT_CONFIGURED', 'The server is not configured to reach the backend.');

  let search = '';
  if (method === 'GET') {
    search = new URL(request.url).search;
    if (search && !QUERY.test(search)) return fail(400, 'BAD_QUERY', 'The query string is not valid.');
  }

  let body: string | undefined;
  if (method === 'POST') {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    try {
      const parsed: unknown = JSON.parse(raw || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
      body = JSON.stringify(parsed);
    } catch {
      return fail(400, 'INVALID_JSON', 'The request body is not valid JSON.');
    }
  }

  const base = (process.env.CREDENTIA_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const version = process.env.NEXT_PUBLIC_API_VERSION || 'v1';

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/${version}/${path}${search}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    return fail(502, 'UPSTREAM_UNREACHABLE', 'The backend could not be reached.');
  }

  let json: unknown;
  try {
    json = await upstream.json();
  } catch {
    return fail(502, 'UPSTREAM_INVALID_RESPONSE', 'The backend sent a reply that could not be read.');
  }
  if (upstream.ok) return NextResponse.json(json, { status: upstream.status === 202 ? 202 : 200 });

  const e = (json as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
  const code = typeof e?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(e.code) ? e.code : 'UPSTREAM_ERROR';
  const message = typeof e?.message === 'string' ? e.message.slice(0, 300) : 'The request failed.';
  const details =
    code === 'VALIDATION_ERROR' && Array.isArray(e?.details)
      ? (e!.details as unknown[])
          .filter((d): d is { field: string; message: string } => typeof (d as { field?: unknown })?.field === 'string' && typeof (d as { message?: unknown })?.message === 'string')
          .slice(0, 10)
          .map((d) => ({ field: d.field.slice(0, 80), message: d.message.slice(0, 200) }))
      : undefined;
  return fail(PASS_THROUGH_STATUS.has(upstream.status) ? upstream.status : 502, code, message, details);
}

export async function GET(request: Request, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return forward('GET', request, ctx.params);
}

export async function POST(request: Request, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return forward('POST', request, ctx.params);
}
