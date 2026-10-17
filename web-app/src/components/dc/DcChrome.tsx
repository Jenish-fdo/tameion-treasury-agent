'use client';

import Link from 'next/link';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';
import '@/styles/dc.css';
import { PageTransition } from './motion';
import { AccountButton } from './AccountButton';


const LINKS = [
  { href: '/issue', label: 'Issue' },
  { href: '/dashboard', label: 'My credentials' },
  { href: '/payment-check', label: 'Payment check' },
  { href: '/founder/mandates', label: 'Mandates' },
  { href: '/founder/decisions', label: 'Decisions' },
  { href: '/agent/validate', label: 'Agent check' },
];

export function DcHeader({ wallet = true }: { wallet?: boolean }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-sheet">
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          <Link href="/" className="flex flex-col leading-none" aria-label="Credentia home">
            <span className="text-lg font-extrabold tracking-[0.18em]">CREDENTIA</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">Treasury Autopsy · Arc testnet</span>
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full gap-5 sm:order-none sm:w-auto">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-semibold underline-offset-4 hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/issue" className="btn-signal">
              Issue credential
            </Link>
            {wallet && <AccountButton />}
          </div>
        </div>
      </header>
    </>
  );
}

export function DcFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-paper-deep">
      <div className="container py-8">
        <p className="max-w-3xl text-sm text-ink-soft">
          Credentia Treasury Autopsy is an early build on Arc testnet. It is not audited and not ready for real funds. A verified status means the
          details match a record on the registry, not that the issuer is trustworthy.
        </p>
        <p className="dc-label mt-3">Credentia Treasury Autopsy</p>
      </div>
    </footer>
  );
}

/** Shared frame for the credential pages: header, main landmark, page transition, toasts, footer. */
export function DcShell({ children, wallet = true }: { children: ReactNode; wallet?: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-screen flex-col">
      <DcHeader wallet={wallet} />
      <main id="main" className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <DcFooter />
      <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: 6, border: '1px solid #C8BFAF', background: '#FFFDF8', color: '#101A2B' } }} />
    </div>
    </MotionConfig>
  );
}
