'use client';

import { useEffect, useState } from 'react';

/** The site origin, available after mount (empty during server rendering so markup matches). */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
