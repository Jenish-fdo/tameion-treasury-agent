import { cn } from '@/lib/utils';
import { CHAPTERS } from './story-data';

/** Quiet chapter index on the right edge (large screens). The mobile counter lives in the header. */
export function StoryProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <nav aria-label="Story chapters" className="fixed right-2 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
      <ol className="space-y-1">
        {CHAPTERS.map((c, i) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              aria-label={`Chapter ${c.n}: ${c.name}`}
              aria-current={i === activeIndex ? 'location' : undefined}
              className={cn('block border-r-2 py-1 pl-3 pr-2 text-right font-mono text-[11px] tracking-[0.12em]', i === activeIndex ? 'border-signal font-semibold text-ink' : 'border-transparent text-ink-soft/70 hover:text-ink')}
            >
              {c.n}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
