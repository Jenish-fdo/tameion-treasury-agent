'use client';

import { useEffect, useSyncExternalStore, type RefObject } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}

/** True when the user asked for reduced motion. Server and first paint assume false; CSS covers that gap. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false),
    () => false
  );
}

/** Tracks which chapter section is under the middle of the viewport. */
export function useActiveChapter(root: RefObject<HTMLElement>, ids: readonly string[], onChange: (index: number) => void) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !root.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) onChange(ids.indexOf(e.target.id));
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [root, ids, onChange]);
}

/**
 * Fades in [data-reveal] blocks as they scroll into view. Blocks already on screen are left alone,
 * so nothing flashes; without JS (or with reduced motion) nothing is ever hidden.
 */
export function useReveal(root: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]')).filter((t) => t.getBoundingClientRect().top > window.innerHeight * 0.92);
    targets.forEach((t) => t.classList.add('is-pending'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.remove('is-pending');
          observer.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    targets.forEach((t) => observer.observe(t));
    return () => {
      observer.disconnect();
      targets.forEach((t) => t.classList.remove('is-pending'));
    };
  }, [root, enabled]);
}
