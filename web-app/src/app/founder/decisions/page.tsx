import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { DecisionsView } from '@/components/treasury/DecisionsView';

export const metadata: Metadata = { title: 'Decisions and approvals — Credentia Treasury Autopsy' };

export default function FounderDecisionsPage() {
  return (
    <DcShell wallet={false}>
      <DecisionsView />
    </DcShell>
  );
}
