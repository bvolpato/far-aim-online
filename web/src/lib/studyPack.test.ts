import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_KEY } from '@/hooks/useReadingHistory';
import { STUDY_MARKS_KEY } from '@/hooks/useStudyMarks';
import { createStudyPack, importStudyPackContent } from './studyPack';

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

describe('study-pack contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('rejects unknown schemas without modifying saved work', () => {
    localStorage.setItem(STUDY_MARKS_KEY, '[]');

    expect(() => importStudyPackContent('{"schemaVersion":2,"app":"FAR/AIM Pro"}')).toThrow(
      'Invalid FAR/AIM Pro study pack'
    );
    expect(localStorage.getItem(STUDY_MARKS_KEY)).toBe('[]');
  });

  it('keeps newer local marks while importing newer history and search terms', () => {
    localStorage.setItem(
      STUDY_MARKS_KEY,
      JSON.stringify([
        {
          key: 'far:61.57',
          type: 'far',
          reference: '61.57',
          title: 'Local title',
          path: '/far/61#61.57',
          saved: true,
          note: 'Keep local note',
          updatedAt: 300,
        },
      ])
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ corrupt: true }));
    localStorage.setItem('search_history', JSON.stringify(['Currency']));

    const result = importStudyPackContent(
      JSON.stringify({
        schemaVersion: 1,
        app: 'FAR/AIM Pro',
        exportedAt: '2026-07-16T00:00:00.000Z',
        studyMarks: [
          {
            type: 'far',
            reference: '61.57',
            title: 'Older imported title',
            path: '/far/61#61.57',
            saved: true,
            note: 'Do not overwrite',
            updatedAt: 200,
          },
        ],
        readingHistory: [
          {
            type: 'aim',
            id: 4,
            title: 'AIM Chapter 4',
            path: '/aim/4',
            timestamp: 400,
          },
        ],
        searchHistory: ['night currency', 'currency'],
      })
    );

    expect(result.studyMarks[0].note).toBe('Keep local note');
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('search_history') ?? '[]')).toEqual([
      'night currency',
      'currency',
    ]);
  });

  it('exports only validated persisted records', () => {
    localStorage.setItem(STUDY_MARKS_KEY, JSON.stringify([{ type: 'far' }]));
    localStorage.setItem(HISTORY_KEY, JSON.stringify('corrupt'));

    const pack = createStudyPack();

    expect(pack.studyMarks).toEqual([]);
    expect(pack.readingHistory).toEqual([]);
  });

  it('rejects missing timestamps and unsafe imported routes', () => {
    const result = importStudyPackContent(
      JSON.stringify({
        schemaVersion: 1,
        app: 'FAR/AIM Pro',
        exportedAt: '2026-07-16T00:00:00.000Z',
        studyMarks: [
          {
            type: 'far',
            reference: '61.57',
            title: 'Missing timestamp',
            path: '/far/61#61.57',
            saved: true,
          },
          {
            type: 'aim',
            reference: 'AIM 4-3-1',
            title: 'Unsafe route',
            path: 'https://example.com/phishing',
            updatedAt: 500,
          },
        ],
        readingHistory: [
          { type: 'aim', id: 4, title: 'Missing timestamp', path: '/aim/4' },
          { type: 'far', id: 61, title: 'Unsafe route', path: '//example.com', timestamp: 500 },
        ],
        searchHistory: [],
      })
    );

    expect(result.marksImported).toBe(0);
    expect(result.historyImported).toBe(0);
  });
});
