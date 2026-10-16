import { NextResponse } from 'next/server';
import { proxyGet } from '@/lib/server/upstream';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = params.id;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 });
  return proxyGet(`/credential/${id}/verify`);
}
