import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { IssueForm } from '@/components/dc/IssueForm';

export const metadata: Metadata = { title: 'Issue a credential — Credentia' };

export default function IssuePage() {
  return (
    <DcShell>
      <div className="container max-w-2xl py-10 sm:py-14">
        <p className="dc-label">Issue</p>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">Issue a credential</h1>
        <p className="mt-3 text-ink-soft">Fill in the details. You get a link and a QR code that anyone can open to verify it.</p>
        <div className="mt-8">
          <IssueForm />
        </div>
      </div>
    </DcShell>
  );
}
