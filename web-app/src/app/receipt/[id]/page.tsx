import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { ReceiptView } from '@/components/dc/ReceiptView';

export const metadata: Metadata = { title: 'Credential receipt — Credentia', robots: { index: false } };

export default function ReceiptPage({ params, searchParams }: { params: { id: string }; searchParams: { d?: string } }) {
  return (
    <DcShell wallet={false}>
      <ReceiptView id={params.id} d={typeof searchParams.d === 'string' ? searchParams.d : undefined} />
    </DcShell>
  );
}
