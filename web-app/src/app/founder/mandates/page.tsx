import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { MandatesView } from '@/components/treasury/MandatesView';

export const metadata: Metadata = { title: 'Agent mandates — Credentia Treasury Autopsy' };

export default function FounderMandatesPage() {
  return (
    <DcShell wallet={false}>
      <MandatesView />
    </DcShell>
  );
}
