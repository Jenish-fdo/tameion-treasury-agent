'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

/** Smooth wheel scrolling on the landing page only. Skipped entirely under prefers-reduced-motion; native scrollbar and keys keep working. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.12 });
    return () => lenis.destroy();
  }, []);
  return null;
}
