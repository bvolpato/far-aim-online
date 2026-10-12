import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

export type ReaderDensity = 'compact' | 'standard' | 'comfortable';

export interface ReaderPreferences {
  fontScaleIndex: number;
  density: ReaderDensity;
}

export const READER_PREFERENCES_KEY = 'far-aim-pro-reader-preferences';

const FONT_SCALES = [0.9, 1, 1.1, 1.22, 1.36] as const;
const DEFAULT_PREFERENCES: ReaderPreferences = {
  fontScaleIndex: 1,
  density: 'standard',
};

function isDensity(value: unknown): value is ReaderDensity {
  return value === 'compact' || value === 'standard' || value === 'comfortable';
}

function normalizePreferences(value: unknown): ReaderPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES;
  const candidate = value as Partial<ReaderPreferences>;
  const fontScaleIndex = Number.isInteger(candidate.fontScaleIndex)
    ? Math.min(Math.max(candidate.fontScaleIndex ?? 1, 0), FONT_SCALES.length - 1)
    : DEFAULT_PREFERENCES.fontScaleIndex;

  return {
    fontScaleIndex,
    density: isDensity(candidate.density) ? candidate.density : DEFAULT_PREFERENCES.density,
  };
}

function readPreferences() {
  try {
    const stored = localStorage.getItem(READER_PREFERENCES_KEY);
    return stored ? normalizePreferences(JSON.parse(stored)) : DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Failed to parse reader preferences', error);
    return DEFAULT_PREFERENCES;
  }
}

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPreferences(readPreferences());
  }, []);

  const persist = useCallback((next: ReaderPreferences) => {
    const normalized = normalizePreferences(next);
    setPreferences(normalized);
    try {
      localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.error('Failed to save reader preferences', error);
    }
  }, []);

  const decreaseFont = useCallback(() => {
    persist({
      ...preferences,
      fontScaleIndex: Math.max(preferences.fontScaleIndex - 1, 0),
    });
  }, [persist, preferences]);

  const increaseFont = useCallback(() => {
    persist({
      ...preferences,
      fontScaleIndex: Math.min(preferences.fontScaleIndex + 1, FONT_SCALES.length - 1),
    });
  }, [persist, preferences]);

  const setDensity = useCallback(
    (density: ReaderDensity) => {
      persist({ ...preferences, density });
    },
    [persist, preferences]
  );

  const reset = useCallback(() => {
    persist(DEFAULT_PREFERENCES);
  }, [persist]);

  const fontScale = FONT_SCALES[preferences.fontScaleIndex];
  const lineHeight = preferences.density === 'compact'
    ? 1.45
    : preferences.density === 'comfortable'
      ? 1.8
      : 1.65;

  const contentStyle = useMemo<CSSProperties>(() => ({
    fontSize: `${0.95 * fontScale}rem`,
    lineHeight,
  }), [fontScale, lineHeight]);

  return {
    preferences,
    fontScale,
    contentStyle,
    decreaseFont,
    increaseFont,
    setDensity,
    reset,
    canDecreaseFont: preferences.fontScaleIndex > 0,
    canIncreaseFont: preferences.fontScaleIndex < FONT_SCALES.length - 1,
  };
}
