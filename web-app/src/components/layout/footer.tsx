import Link from 'next/link';
import { SAFETY_STATEMENT } from '@/lib/verdict';

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper-deep">
      <div className="container flex flex-col gap-4 py-8 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl font-mono text-xs leading-relaxed text-ink-soft">{SAFETY_STATEMENT}</p>
        <nav aria-label="Footer" className="flex gap-5 text-sm font-semibold">
          <Link href="/payment-check" className="underline-offset-4 hover:underline">Check payment</Link>
          <Link href="/dashboard" className="underline-offset-4 hover:underline">Dashboard</Link>
          <Link href="/credential/create" className="underline-offset-4 hover:underline">Create credential</Link>
        </nav>
      </div>
    </footer>
  );
}
