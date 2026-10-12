import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_HISTORY_ITEMS, parseReadingHistory } from './useReadingHistory';
import { parseStudyMarks, STUDY_MARKS_KEY, updateStoredStudyMarks } from './useStudyMarks';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('browser persistence validation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('drops malformed reading history instead of exposing corrupt state', () => {
    const valid = {
      type: 'far',
      id: 61,
      title: 'Part 61',
      path: '/far/61',
      timestamp: 100,
    };

    expect(parseReadingHistory({ history: [valid] })).toEqual([]);
    expect(parseReadingHistory([valid, null, { ...valid, timestamp: 'now' }])).toEqual([valid]);
  });

  it('limits restored history and accepts only supported reference types', () => {
    const history = Array.from({ length: MAX_HISTORY_ITEMS + 5 }, (_, index) => ({
      type: index === 0 ? 'unknown' : 'aim',
      id: index,
      title: `Chapter ${index}`,
      path: `/aim/${index}`,
      timestamp: index,
    }));

    const parsed = parseReadingHistory(history);
    expect(parsed).toHaveLength(MAX_HISTORY_ITEMS);
    expect(parsed.every((item) => item.type === 'aim')).toBe(true);
  });

  it('canonicalizes study-mark keys and rejects incomplete records', () => {
    const parsed = parseStudyMarks([
      {
        key: 'tampered',
        type: 'ac',
        reference: 'AC 61-98D',
        title: 'Currency guidance',
        path: '/advisory-circulars/ac-61-98d',
        saved: true,
        note: 'Review',
        updatedAt: 200,
      },
      { type: 'far', reference: '61.57', updatedAt: 100 },
      'invalid',
    ]);

    expect(parsed).toEqual([
      expect.objectContaining({
        key: 'ac:AC 61-98D',
        saved: true,
        highlighted: false,
        note: 'Review',
      }),
    ]);
  });

  it('merges each mark update against latest persisted state', () => {
    localStorage.setItem(
      STUDY_MARKS_KEY,
      JSON.stringify([
        {
          type: 'far',
          reference: '61.57',
          title: 'Recent flight experience',
          path: '/far/61#61.57',
          saved: true,
          note: '',
          updatedAt: 100,
        },
      ])
    );

    const next = updateStoredStudyMarks((current) => [
      {
        key: 'far:91.103',
        type: 'far',
        reference: '91.103',
        title: 'Preflight action',
        path: '/far/91#91.103',
        saved: true,
        note: '',
        updatedAt: 200,
      },
      ...current,
    ]);

    expect(next.map((mark) => mark.reference)).toEqual(['91.103', '61.57']);
  });
});
