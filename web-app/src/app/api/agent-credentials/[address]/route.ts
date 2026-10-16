import { NextResponse } from 'next/server';
import { proxyGet } from '@/lib/server/upstream';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { address: string } }): Promise<NextResponse> {
  const address = params.address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 });
  return proxyGet(`/agent/${address}/credentials`);
}
