'use client';

import { useId } from 'react';
import { Info } from 'lucide-react';

/** Keyboard-reachable inline help: a button that reveals a tooltip on hover or focus. */
export function HelpTip({ label, text }: { label: string; text: string }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-describedby={id} className="rounded text-ink-soft hover:text-ink">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded bg-ink px-3 py-2 text-xs font-normal normal-case tracking-normal text-sheet group-focus-within:visible group-hover:visible"
      >
        {text}
      </span>
    </span>
  );
}
