'use client';

import Link from 'next/link';
import { PasskeyButton } from '@/components/dc/PasskeyButton';

const LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/issue', label: 'Issue credential' },
  { href: '/dashboard', label: 'My credentials' },
  { href: '/trust-dashboard', label: 'Trust lookup' },
  { href: '/payment-check', label: 'Check payment' },
];

/** Shared header for the app routes. The landing page has its own story header. */
export function Header() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-sheet">
        Skip to main content
      </a>
      <header className="border-b border-line bg-paper">
        <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          <Link href="/" className="flex flex-col leading-none" aria-label="Credentia home">
            <span className="text-lg font-extrabold tracking-[0.18em]">CREDENTIA</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">Payment evidence layer</span>
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full gap-5 sm:order-none sm:w-auto">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-semibold underline-offset-4 hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/payment-check" className="btn-signal">
              Open payment check
            </Link>
            <PasskeyButton />
          </div>
        </div>
      </header>
    </>
  );
}
