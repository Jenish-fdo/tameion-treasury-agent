import type { Metadata } from 'next';
import { DashboardView } from '@/components/dc/DashboardView';
import { DcShell } from '@/components/dc/DcChrome';
import { IssuerRecord } from '@/components/dc/IssuerRecord';

export const metadata: Metadata = { title: 'My credentials — Credentia' };

export default function DashboardPage() {
  return (
    <DcShell>
      <div className="container max-w-5xl py-10 sm:py-14">
        <p className="dc-label">Dashboard</p>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">My issued credentials</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">Everything you issued from this browser, with its live status from the Monad registry.</p>
        <div className="mt-8">
          <IssuerRecord />
          <DashboardView />
        </div>
      </div>
    </DcShell>
  );
}
