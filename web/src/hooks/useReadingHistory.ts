import { useCallback, useSyncExternalStore } from 'react';
import { isValidStudyPath } from '@/lib/studyPath';

export type HistoryItemType = 'far' | 'aim' | 'ac';

export interface HistoryItem {
  type: HistoryItemType;
  id: string | number;
  title: string;
  timestamp: number;
  path: string;
  subtitle?: string;
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
        Number.isFinite(item.timestamp),
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
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? parseReadingHistory(JSON.parse(stored)) : [];
  } catch (error) {
    console.error('Failed to parse reading history', error);
    return [];
  }
}

const EMPTY_HISTORY: HistoryItem[] = [];
const listeners = new Set<() => void>();
let clientSnapshot: HistoryItem[] = EMPTY_HISTORY;
let initialized = false;
let cachedRaw: string | null = null;
let storageListenerAttached = false;

function emitChange() {
  for (const listener of listeners) listener();
}

function syncFromStorage() {
  if (typeof window === 'undefined') return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(HISTORY_KEY);
  } catch {
    return;
  }
  if (initialized && raw === cachedRaw) return;
  cachedRaw = raw;
  initialized = true;
  if (!raw) {
    clientSnapshot = EMPTY_HISTORY;
    return;
  }
  try {
    clientSnapshot = parseReadingHistory(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to parse reading history', error);
    clientSnapshot = EMPTY_HISTORY;
  }
}

export function refreshReadingHistoryStore() {
  const prev = clientSnapshot;
  initialized = false;
  syncFromStorage();
  if (clientSnapshot !== prev) emitChange();
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== HISTORY_KEY) return;
  const previous = clientSnapshot;
  syncFromStorage();
  if (clientSnapshot !== previous) emitChange();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== 'undefined' && !storageListenerAttached) {
    storageListenerAttached = true;
    window.addEventListener('storage', handleStorageEvent);
  }
  if (!initialized) syncFromStorage();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (typeof window !== 'undefined' && storageListenerAttached) {
        window.removeEventListener('storage', handleStorageEvent);
        storageListenerAttached = false;
      }
      initialized = false;
      cachedRaw = null;
    }
  };
}

function getSnapshot(): HistoryItem[] {
  if (!initialized) syncFromStorage();
  return clientSnapshot;
}

function getServerSnapshot(): HistoryItem[] {
  return EMPTY_HISTORY;
}

function writeHistory(nextHistory: HistoryItem[]) {
  let serialized: string | null = null;
  try {
    if (nextHistory.length === 0) {
      localStorage.removeItem(HISTORY_KEY);
    } else {
      serialized = JSON.stringify(nextHistory);
      localStorage.setItem(HISTORY_KEY, serialized);
    }
  } catch (error) {
    console.error('Failed to save reading history', error);
  }
  cachedRaw = serialized;
  initialized = true;
  clientSnapshot = nextHistory;
  emitChange();
}

export function useReadingHistory() {
  const history = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addToHistory = useCallback((item: Omit<HistoryItem, 'timestamp'>) => {
    const prev = getSnapshot();
    const filtered = prev.filter(
      (i) => !(i.type === item.type && i.id.toString() === item.id.toString()),
    );
    const newItem: HistoryItem = {
      ...item,
      timestamp: Date.now(),
    };
    writeHistory([newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS));
  }, []);

  const clearHistory = useCallback(() => {
    writeHistory([]);
  }, []);

  const getLastViewed = useCallback(
    (type: HistoryItemType) => history.find((i) => i.type === type),
    [history],
  );

  return {
    history,
    addToHistory,
    clearHistory,
    getLastViewed,
  };
}
