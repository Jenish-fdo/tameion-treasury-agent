'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Check as CheckIcon, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Check } from '@/lib/dc/checks';

const ICON = { pass: CheckIcon, fail: X, skip: Minus } as const;
const TEXT = { pass: 'Passed', fail: 'Failed', skip: 'Skipped' } as const;
const TONE = { pass: 'border-go bg-go-soft text-go', fail: 'border-stop bg-stop-soft text-stop', skip: 'border-line bg-paper-deep text-ink-soft' } as const;

/** The checks behind the verdict, ticking in one after another. Static (same content) under reduced motion. */
export function CheckList({ checks }: { checks: Check[] }) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="checks-heading" className="dc-sheet bg-sheet p-5">
      <h2 id="checks-heading" className="dc-label">What was checked</h2>
      <ol className="mt-3 divide-y divide-line">
        {checks.map((c, i) => {
          const Icon = ICON[c.state];
          return (
            <motion.li
              key={c.label}
              className="flex items-start gap-3 py-2.5"
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.15 + i * 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={cn('mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border', TONE[c.state])}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">{TEXT[c.state]}</span>
                <span className="block text-sm text-ink-soft">{c.note}</span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
