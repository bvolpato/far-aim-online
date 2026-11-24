import { useEffect, useState } from 'react';

export function useActiveSectionId(ids: string[], enabled = true): string {
  const [activeSectionId, setActiveSectionId] = useState('');

  useEffect(() => {
    setActiveSectionId('');
    if (!enabled || typeof window === 'undefined' || !('IntersectionObserver' in window) || ids.length === 0) {
      return;
    }

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const intersecting = new Map<string, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.set(entry.target.id, entry);
          } else {
            intersecting.delete(entry.target.id);
          }
        }

        if (intersecting.size === 0) return;

        let bestId = '';
        let bestDistance = Infinity;
        for (const [id, entry] of intersecting) {
          const distance = Math.abs(entry.boundingClientRect.top - 100);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = id;
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
