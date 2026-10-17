import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { ValidateView } from '@/components/treasury/ValidateView';

export const metadata: Metadata = { title: 'Check a payment — Credentia Treasury Autopsy' };

export default function AgentValidatePage() {
  return (
    <DcShell wallet={false}>
      <ValidateView />
    </DcShell>
  );
}
