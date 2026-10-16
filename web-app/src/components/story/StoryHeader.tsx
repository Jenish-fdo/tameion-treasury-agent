import Link from 'next/link';
import { CHAPTERS } from './story-data';

/** Sticky header. No wallet widget here: the story must work with no wallet, API or provider. */
export function StoryHeader({ activeIndex }: { activeIndex: number }) {
  return (
    <>
      <a href="/payment-check" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-sheet">
        Skip story — open payment check
      </a>
      <header className="sticky top-0 z-50 border-b border-line bg-sheet">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex flex-col leading-none" aria-label="Credentia home">
            <span className="text-lg font-extrabold tracking-[0.2em]">CREDENTIA</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">Payment evidence layer</span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="font-mono text-xs text-ink-soft lg:hidden" aria-hidden="true">
              {CHAPTERS[activeIndex].n} / 06
            </span>
            <a href="#how-it-works" className="hidden text-xs font-bold uppercase tracking-[0.14em] underline-offset-4 hover:underline sm:inline">
              How it works
            </a>
            <Link href="/dashboard" className="hidden text-xs font-bold uppercase tracking-[0.14em] underline-offset-4 hover:underline md:inline">
              Dashboard
            </Link>
            <Link href="/payment-check" className="btn-signal">
              Open payment check
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
