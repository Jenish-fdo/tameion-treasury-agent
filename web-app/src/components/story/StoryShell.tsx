'use client';

import { useCallback, useRef, useState } from 'react';
import { CHAPTERS } from './story-data';
import { StoryHeader } from './StoryHeader';
import { StoryProgress } from './StoryProgress';
import { useActiveChapter, useReducedMotion, useReveal } from './useStory';

const IDS = CHAPTERS.map((c) => c.id);

/**
 * Wraps the story: sticky header, chapter progress, and the (optional) reveal motion.
 * In reduced-motion mode nothing is armed, so the page is a plain stacked document.
 */
export function StoryShell({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const onChange = useCallback((i: number) => i >= 0 && setActive(i), []);

  useActiveChapter(root, IDS, onChange);
  useReveal(root, !reduced);

  return (
    <div ref={root} className="story bg-paper text-ink" data-motion={reduced ? 'reduce' : 'full'}>
      <StoryHeader activeIndex={active} />
      <StoryProgress activeIndex={active} />
      {/* lg:pr-12 reserves the strip where the fixed chapter index sits, so it never overlaps content */}
      <main id="main" className="lg:pr-12">{children}</main>
    </div>
  );
}
