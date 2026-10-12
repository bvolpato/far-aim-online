import { useState, useEffect, useCallback } from 'react';
import { isValidStudyPath } from '@/lib/studyPath';

export type HistoryItemType = 'far' | 'aim' | 'ac';

export interface HistoryItem {
  type: HistoryItemType;
  id: string | number;
  title: string;
  timestamp: number;
  path: string;
  subtitle?: string; // For things like "Subchapter A" or section count
}

export const HISTORY_KEY = 'far-aim-pro-reading-history';
export const MAX_HISTORY_ITEMS = 20;

export function isHistoryItemType(value: unknown): value is HistoryItemType {
  return value === 'far' || value === 'aim' || value === 'ac';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseReadingHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter(
      (item) =>
        isHistoryItemType(item.type) &&
        (typeof item.id === 'string' || typeof item.id === 'number') &&
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        typeof item.path === 'string' &&
        isValidStudyPath(item.type, item.path) &&
        typeof item.timestamp === 'number' &&
        Number.isFinite(item.timestamp)
    )
    .map((item) => ({
      type: item.type as HistoryItemType,
      id: item.id as string | number,
      title: item.title as string,
      path: item.path as string,
      timestamp: item.timestamp as number,
      subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
    }))
    .slice(0, MAX_HISTORY_ITEMS);
}

export function readStoredHistory(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? parseReadingHistory(JSON.parse(stored)) : [];
  } catch (error) {
    console.error('Failed to parse reading history', error);
    return [];
  }
}

export function useReadingHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history on mount
  useEffect(() => {
    setHistory(readStoredHistory());
  }, []);

  const addToHistory = useCallback((item: Omit<HistoryItem, 'timestamp'>) => {
    setHistory((prev) => {
      // Remove existing entry for the same ID to avoid duplicates (move to top)
      const filtered = prev.filter(
        (i) => !(i.type === item.type && i.id.toString() === item.id.toString())
      );
      
      const newItem: HistoryItem = {
        ...item,
        timestamp: Date.now(),
      };

      const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      } catch (e) {
        console.error('Failed to save reading history', e);
      }
      
      return newHistory;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  return {
    history,
    addToHistory,
    clearHistory,
    // Helper to get just the last viewed item of a specific type
    getLastViewed: (type: HistoryItemType) => history.find(i => i.type === type),
  };
}
