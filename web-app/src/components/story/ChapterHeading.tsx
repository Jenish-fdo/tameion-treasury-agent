import { cn } from '@/lib/utils';

/** Eyebrow + serif headline + body. `level` 1 is used once, in chapter 01. Headline lines break where the copy does. */
export function ChapterHeading({ id, eyebrow, lines, body, level = 2, className }: { id: string; eyebrow: string; lines: string[]; body: string; level?: 1 | 2; className?: string }) {
  const Tag = level === 1 ? 'h1' : 'h2';
  return (
    <div className={className}>
      <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-ink-soft" data-reveal>{eyebrow}</p>
      <Tag id={id} className={cn('mt-4 font-display font-normal leading-[1.04] tracking-tight', level === 1 ? 'text-5xl sm:text-6xl lg:text-7xl' : 'text-4xl sm:text-5xl lg:text-6xl')} data-reveal style={{ ['--d' as string]: '80ms' }}>
        {lines.map((l) => (
          <span key={l} className="block">{l}</span>
        ))}
      </Tag>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft" data-reveal style={{ ['--d' as string]: '160ms' }}>{body}</p>
    </div>
  );
}
