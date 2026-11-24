import { useEffect, useState } from 'react';

export function useActiveSectionId(ids: string[], enabled = true): string {
  const [activeSectionId, setActiveSectionId] = useState('');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('IntersectionObserver' in window) || ids.length === 0) {
      return;
    }

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestId = '';
        let bestDistance = Infinity;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const distance = Math.abs(entry.boundingClientRect.top - 100);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = entry.target.id;
          }
        }
        if (bestId) {
          setActiveSectionId(bestId);
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.25],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, ids]);

  return activeSectionId;
}
