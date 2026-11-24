import { useCallback, useSyncExternalStore } from 'react';
import { isValidStudyPath } from '@/lib/studyPath';

export type StudyMarkType = 'far' | 'aim' | 'ac';

export interface StudyMark {
  key: string;
  type: StudyMarkType;
  reference: string;
  title: string;
  path: string;
  saved: boolean;
  highlighted?: boolean;
  note: string;
  savedAt?: number;
  reviewedAt?: number;
  updatedAt: number;
}

export interface StudyMarkInput {
  type: StudyMarkType;
  reference: string;
  title: string;
  path: string;
}

export interface StudyMarkStats {
  saved: number;
  highlighted: number;
  withNotes: number;
  reviewed: number;
  total: number;
}

interface StudyMarksSnapshot {
  marks: StudyMark[];
  byKey: Map<string, StudyMark>;
  stats: StudyMarkStats;
}

export const STUDY_MARKS_KEY = 'far-aim-pro-study-marks';

export function studyMarkKey(type: StudyMarkType, reference: string) {
  return `${type}:${reference}`;
}

export function isStudyMarkType(value: unknown): value is StudyMarkType {
  return value === 'far' || value === 'aim' || value === 'ac';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseStudyMarks(value: unknown): StudyMark[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): StudyMark[] => {
    if (
      !isRecord(item) ||
      !isStudyMarkType(item.type) ||
      typeof item.reference !== 'string' ||
      item.reference.trim().length === 0 ||
      typeof item.title !== 'string' ||
      item.title.trim().length === 0 ||
      typeof item.path !== 'string' ||
      !isValidStudyPath(item.type, item.path) ||
      typeof item.updatedAt !== 'number' ||
      !Number.isFinite(item.updatedAt)
    ) {
      return [];
    }

    return [{
      key: studyMarkKey(item.type, item.reference),
      type: item.type,
      reference: item.reference,
      title: item.title,
      path: item.path,
      saved: item.saved === true,
      highlighted: item.highlighted === true,
      note: typeof item.note === 'string' ? item.note : '',
      savedAt: optionalFiniteNumber(item.savedAt),
      reviewedAt: optionalFiniteNumber(item.reviewedAt),
      updatedAt: item.updatedAt,
    }];
  });
}

export function readStoredStudyMarks(): StudyMark[] {
  try {
    const stored = localStorage.getItem(STUDY_MARKS_KEY);
    if (!stored) return [];
    return parseStudyMarks(JSON.parse(stored));
  } catch (error) {
    console.error('Failed to parse study marks', error);
    return [];
  }
}

export function writeStoredStudyMarks(marks: StudyMark[]) {
  const serialized = JSON.stringify(marks);
  localStorage.setItem(STUDY_MARKS_KEY, serialized);
  setStoreMarks(marks, serialized);
}

export function sortStudyMarks(marks: StudyMark[]) {
  return [...marks].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function updateStoredStudyMarks(updater: (current: StudyMark[]) => StudyMark[]) {
  const next = sortStudyMarks(updater(readStoredStudyMarks()));
  writeStoredStudyMarks(next);
  return next;
}

function buildSnapshot(marks: StudyMark[]): StudyMarksSnapshot {
  const byKey = new Map<string, StudyMark>();
  let saved = 0;
  let highlighted = 0;
  let withNotes = 0;
  let reviewed = 0;
  for (const mark of marks) {
    byKey.set(mark.key, mark);
    if (mark.saved) saved += 1;
    if (mark.highlighted) highlighted += 1;
    if (mark.note) withNotes += 1;
    if (mark.reviewedAt) reviewed += 1;
  }
  return {
    marks,
    byKey,
    stats: { saved, highlighted, withNotes, reviewed, total: marks.length },
  };
}

const EMPTY_SNAPSHOT: StudyMarksSnapshot = buildSnapshot([]);
const listeners = new Set<() => void>();
let clientSnapshot: StudyMarksSnapshot = EMPTY_SNAPSHOT;
let initialized = false;
let cachedRaw: string | null = null;
let storageListenerAttached = false;

function emitChange() {
  for (const listener of listeners) listener();
}

function setStoreMarks(marks: StudyMark[], raw: string | null) {
  cachedRaw = raw;
  initialized = true;
  clientSnapshot = buildSnapshot(marks);
  emitChange();
}

function syncFromStorage() {
  if (typeof window === 'undefined') return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STUDY_MARKS_KEY);
  } catch (error) {
    console.error('Failed to read study marks', error);
    return;
  }
  if (initialized && raw === cachedRaw) return;
  cachedRaw = raw;
  initialized = true;
  if (!raw) {
    clientSnapshot = EMPTY_SNAPSHOT;
    return;
  }
  try {
    clientSnapshot = buildSnapshot(parseStudyMarks(JSON.parse(raw)));
  } catch (error) {
    console.error('Failed to parse study marks', error);
    clientSnapshot = EMPTY_SNAPSHOT;
  }
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STUDY_MARKS_KEY) return;
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
  if (!initialized) {
    syncFromStorage();
  }
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

function getClientSnapshot(): StudyMarksSnapshot {
  if (!initialized) {
    syncFromStorage();
  }
  return clientSnapshot;
}

function getServerSnapshot(): StudyMarksSnapshot {
  return EMPTY_SNAPSHOT;
}

function persistStudyMarks(updater: (current: StudyMark[]) => StudyMark[]) {
  try {
    updateStoredStudyMarks(updater);
  } catch (error) {
    console.error('Failed to save study marks', error);
    syncFromStorage();
    emitChange();
  }
}

export function replaceStudyMarks(nextMarks: StudyMark[]) {
  const next = sortStudyMarks(nextMarks);
  try {
    writeStoredStudyMarks(next);
  } catch (error) {
    console.error('Failed to save study marks', error);
    setStoreMarks(next, null);
  }
}

function upsertStudyMark(input: StudyMarkInput, update: (mark: StudyMark) => StudyMark) {
  persistStudyMarks((current) => {
    const key = studyMarkKey(input.type, input.reference);
    const existing = current.find((mark) => mark.key === key);
    const base: StudyMark =
      existing || {
        key,
        type: input.type,
        reference: input.reference,
        title: input.title,
        path: input.path,
        saved: false,
        highlighted: false,
        note: '',
        updatedAt: Date.now(),
      };

    const nextMark = update({
      ...base,
      title: input.title,
      path: input.path,
      updatedAt: Date.now(),
    });

    const withoutCurrent = current.filter((mark) => mark.key !== key);
    if (!nextMark.saved && !nextMark.highlighted && !nextMark.note && !nextMark.reviewedAt) {
      return withoutCurrent;
    }
    return [nextMark, ...withoutCurrent];
  });
}

export function toggleStudyMarkSaved(input: StudyMarkInput) {
  upsertStudyMark(input, (mark) => ({
    ...mark,
    saved: !mark.saved,
    savedAt: mark.saved ? undefined : Date.now(),
  }));
}

export function saveStudyMarkNote(input: StudyMarkInput, note: string) {
  upsertStudyMark(input, (mark) => ({
    ...mark,
    note: note.trim(),
  }));
}

export function toggleStudyMarkHighlighted(input: StudyMarkInput) {
  upsertStudyMark(input, (mark) => ({
    ...mark,
    highlighted: !mark.highlighted,
  }));
}

export function markStudyMarkReviewed(input: StudyMarkInput) {
  upsertStudyMark(input, (mark) => ({
    ...mark,
    reviewedAt: Date.now(),
  }));
}

export function removeStudyMark(key: string) {
  persistStudyMarks((current) => current.filter((mark) => mark.key !== key));
}

export function useStudyMark(type: StudyMarkType, reference: string): StudyMark | undefined {
  const key = studyMarkKey(type, reference);
  return useSyncExternalStore(
    subscribe,
    () => getClientSnapshot().byKey.get(key),
    () => undefined,
  );
}

export function useStudyMarkStats(): StudyMarkStats {
  return useSyncExternalStore(
    subscribe,
    () => getClientSnapshot().stats,
    () => EMPTY_SNAPSHOT.stats,
  );
}

export function useStudyMarks() {
  const snapshot = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const getMark = useCallback(
    (type: StudyMarkType, reference: string) => snapshot.byKey.get(studyMarkKey(type, reference)),
    [snapshot.byKey],
  );

  return {
    marks: snapshot.marks,
    stats: snapshot.stats,
    getMark,
    toggleSaved: toggleStudyMarkSaved,
    toggleHighlighted: toggleStudyMarkHighlighted,
    saveNote: saveStudyMarkNote,
    markReviewed: markStudyMarkReviewed,
    removeMark: removeStudyMark,
    replaceMarks: replaceStudyMarks,
  };
}
