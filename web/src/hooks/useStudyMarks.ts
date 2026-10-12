import { useCallback, useEffect, useMemo, useState } from 'react';
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

export const STUDY_MARKS_KEY = 'far-aim-pro-study-marks';

function markKey(type: StudyMarkType, reference: string) {
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
      key: markKey(item.type, item.reference),
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
  localStorage.setItem(STUDY_MARKS_KEY, JSON.stringify(marks));
}

export function sortStudyMarks(marks: StudyMark[]) {
  return [...marks].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function updateStoredStudyMarks(updater: (current: StudyMark[]) => StudyMark[]) {
  const next = sortStudyMarks(updater(readStoredStudyMarks()));
  writeStoredStudyMarks(next);
  return next;
}

export function useStudyMarks() {
  const [marks, setMarks] = useState<StudyMark[]>([]);

  useEffect(() => {
    setMarks(readStoredStudyMarks());
  }, []);

  const persist = useCallback((updater: (current: StudyMark[]) => StudyMark[]) => {
    setMarks(() => {
      try {
        return updateStoredStudyMarks(updater);
      } catch (error) {
        console.error('Failed to save study marks', error);
        return readStoredStudyMarks();
      }
    });
  }, []);

  const replaceMarks = useCallback((nextMarks: StudyMark[]) => {
    const next = sortStudyMarks(nextMarks);
    try {
      writeStoredStudyMarks(next);
    } catch (error) {
      console.error('Failed to save study marks', error);
    }
    setMarks(next);
  }, []);

  const getMark = useCallback(
    (type: StudyMarkType, reference: string) =>
      marks.find((mark) => mark.key === markKey(type, reference)),
    [marks]
  );

  const upsertMark = useCallback(
    (input: StudyMarkInput, update: (mark: StudyMark) => StudyMark) => {
      persist((current) => {
        const key = markKey(input.type, input.reference);
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
    },
    [persist]
  );

  const toggleSaved = useCallback(
    (input: StudyMarkInput) => {
      upsertMark(input, (mark) => ({
        ...mark,
        saved: !mark.saved,
        savedAt: mark.saved ? undefined : Date.now(),
      }));
    },
    [upsertMark]
  );

  const saveNote = useCallback(
    (input: StudyMarkInput, note: string) => {
      upsertMark(input, (mark) => ({
        ...mark,
        note: note.trim(),
      }));
    },
    [upsertMark]
  );

  const toggleHighlighted = useCallback(
    (input: StudyMarkInput) => {
      upsertMark(input, (mark) => ({
        ...mark,
        highlighted: !mark.highlighted,
      }));
    },
    [upsertMark]
  );

  const markReviewed = useCallback(
    (input: StudyMarkInput) => {
      upsertMark(input, (mark) => ({
        ...mark,
        reviewedAt: Date.now(),
      }));
    },
    [upsertMark]
  );

  const removeMark = useCallback(
    (key: string) => {
      persist((current) => current.filter((mark) => mark.key !== key));
    },
    [persist]
  );

  const stats = useMemo(() => {
    const withNotes = marks.filter((mark) => mark.note).length;
    const saved = marks.filter((mark) => mark.saved).length;
    const highlighted = marks.filter((mark) => mark.highlighted).length;
    const reviewed = marks.filter((mark) => mark.reviewedAt).length;
    return { saved, highlighted, withNotes, reviewed, total: marks.length };
  }, [marks]);

  return {
    marks,
    stats,
    getMark,
    toggleSaved,
    toggleHighlighted,
    saveNote,
    markReviewed,
    removeMark,
    replaceMarks,
  };
}
