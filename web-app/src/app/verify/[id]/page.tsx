import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { VerifyView } from '@/components/dc/VerifyView';

export const metadata: Metadata = { title: 'Verify a credential — Credentia', robots: { index: false } };

export default function VerifyPage({ params, searchParams }: { params: { id: string }; searchParams: { d?: string } }) {
  return (
    <DcShell wallet={false}>
      <VerifyView id={params.id} d={typeof searchParams.d === 'string' ? searchParams.d : undefined} />
    </DcShell>
  );
}
