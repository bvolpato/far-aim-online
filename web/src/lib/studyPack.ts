import {
  HISTORY_KEY,
  MAX_HISTORY_ITEMS,
  isHistoryItemType,
  readStoredHistory,
  type HistoryItem,
} from '@/hooks/useReadingHistory';
import {
  isStudyMarkType,
  readStoredStudyMarks,
  sortStudyMarks,
  writeStoredStudyMarks,
  type StudyMark,
} from '@/hooks/useStudyMarks';
import { isValidStudyPath } from './studyPath';

const SEARCH_HISTORY_KEY = 'search_history';
const SEARCH_HISTORY_LIMIT = 10;

export interface StudyPack {
  schemaVersion: 1;
  app: 'FAR/AIM Pro';
  exportedAt: string;
  studyMarks: StudyMark[];
  readingHistory: HistoryItem[];
  searchHistory: string[];
}

export interface StudyPackImportResult {
  studyMarks: StudyMark[];
  marksImported: number;
  historyImported: number;
  searchHistoryImported: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArray<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Failed to parse ${key}`, error);
    return [];
  }
}

function numberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeStudyMark(value: unknown): StudyMark | undefined {
  if (
    !isRecord(value) ||
    !isStudyMarkType(value.type) ||
    typeof value.reference !== 'string' ||
    value.reference.trim().length === 0
  ) {
    return undefined;
  }

  if (
    typeof value.title !== 'string' ||
    value.title.trim().length === 0 ||
    typeof value.path !== 'string' ||
    !isValidStudyPath(value.type, value.path)
  ) {
    return undefined;
  }

  const updatedAt = numberOrUndefined(value.updatedAt);
  if (updatedAt === undefined) return undefined;

  return {
    key: `${value.type}:${value.reference}`,
    type: value.type,
    reference: value.reference,
    title: value.title,
    path: value.path,
    saved: value.saved === true,
    highlighted: value.highlighted === true,
    note: typeof value.note === 'string' ? value.note : '',
    savedAt: numberOrUndefined(value.savedAt),
    reviewedAt: numberOrUndefined(value.reviewedAt),
    updatedAt,
  };
}

function normalizeHistoryItem(value: unknown): HistoryItem | undefined {
  if (!isRecord(value) || !isHistoryItemType(value.type)) {
    return undefined;
  }

  const id = typeof value.id === 'string' || typeof value.id === 'number' ? value.id : undefined;
  if (
    id === undefined ||
    typeof value.title !== 'string' ||
    value.title.trim().length === 0 ||
    typeof value.path !== 'string' ||
    !isValidStudyPath(value.type, value.path)
  ) {
    return undefined;
  }

  const timestamp = numberOrUndefined(value.timestamp);
  if (timestamp === undefined) return undefined;

  return {
    type: value.type,
    id,
    title: value.title,
    path: value.path,
    subtitle: typeof value.subtitle === 'string' ? value.subtitle : undefined,
    timestamp,
  };
}

function readSearchHistory() {
  return readArray<unknown>(SEARCH_HISTORY_KEY)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, SEARCH_HISTORY_LIMIT);
}

function mergeStudyMarks(current: StudyMark[], incoming: StudyMark[]) {
  const byKey = new Map<string, StudyMark>();

  current.forEach((mark) => {
    byKey.set(mark.key, mark);
  });

  incoming.forEach((mark) => {
    const existing = byKey.get(mark.key);
    if (!existing || mark.updatedAt >= existing.updatedAt) {
      byKey.set(mark.key, mark);
    }
  });

  return sortStudyMarks(Array.from(byKey.values()));
}

function mergeHistory(current: HistoryItem[], incoming: HistoryItem[]) {
  const byKey = new Map<string, HistoryItem>();

  [...current, ...incoming].forEach((item) => {
    const key = `${item.type}:${String(item.id)}`;
    const existing = byKey.get(key);
    if (!existing || item.timestamp >= existing.timestamp) {
      byKey.set(key, item);
    }
  });

  return Array.from(byKey.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY_ITEMS);
}

function mergeSearchHistory(current: string[], incoming: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];

  [...incoming, ...current].forEach((item) => {
    const normalized = item.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  });

  return merged.slice(0, SEARCH_HISTORY_LIMIT);
}

function normalizeSearchHistory(values: string[]) {
  return mergeSearchHistory([], values);
}

export function createStudyPack(): StudyPack {
  return {
    schemaVersion: 1,
    app: 'FAR/AIM Pro',
    exportedAt: new Date().toISOString(),
    studyMarks: readStoredStudyMarks(),
    readingHistory: readStoredHistory(),
    searchHistory: readSearchHistory(),
  };
}

export function downloadStudyPack() {
  const pack = createStudyPack();
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `far-aim-pro-study-pack-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return pack;
}

export function importStudyPackContent(content: string): StudyPackImportResult {
  const parsed = JSON.parse(content);

  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || parsed.app !== 'FAR/AIM Pro') {
    throw new Error('Invalid FAR/AIM Pro study pack');
  }

  const incomingMarks = Array.isArray(parsed.studyMarks)
    ? parsed.studyMarks.map(normalizeStudyMark).filter((mark): mark is StudyMark => Boolean(mark))
    : [];
  const incomingHistory = Array.isArray(parsed.readingHistory)
    ? parsed.readingHistory.map(normalizeHistoryItem).filter((item): item is HistoryItem => Boolean(item))
    : [];
  const incomingSearchHistory = normalizeSearchHistory(
    Array.isArray(parsed.searchHistory)
      ? parsed.searchHistory.filter((item): item is string => typeof item === 'string')
      : []
  );

  const studyMarks = mergeStudyMarks(readStoredStudyMarks(), incomingMarks);
  const readingHistory = mergeHistory(readStoredHistory(), incomingHistory);
  const searchHistory = mergeSearchHistory(readSearchHistory(), incomingSearchHistory);

  writeStoredStudyMarks(studyMarks);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(readingHistory));
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));

  return {
    studyMarks,
    marksImported: incomingMarks.length,
    historyImported: incomingHistory.length,
    searchHistoryImported: incomingSearchHistory.length,
  };
}

export async function importStudyPackFile(file: File) {
  return importStudyPackContent(await file.text());
}
