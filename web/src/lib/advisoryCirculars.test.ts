import { describe, expect, it } from 'vitest';
import type { AdvisoryCircular } from '../data';
import { sortAdvisoryCirculars } from './advisoryCirculars';

const circulars = [
  { id: 'old', number: '90-1', title: 'Zulu', issued: '2020-01-01' },
  { id: 'new', number: '10-2', title: 'Alpha', issued: '2026-07-02' },
  { id: 'middle', number: '2-3', title: 'Mike', issued: '2024-05-15' },
] as AdvisoryCircular[];

describe('sortAdvisoryCirculars', () => {
  it('sorts newest first by default order', () => {
    expect(sortAdvisoryCirculars(circulars, 'newest').map((ac) => ac.id)).toEqual([
      'new',
      'middle',
      'old',
    ]);
  });

  it('supports oldest, number, and title ordering', () => {
    expect(sortAdvisoryCirculars(circulars, 'oldest').map((ac) => ac.id)).toEqual([
      'old',
      'middle',
      'new',
    ]);
    expect(sortAdvisoryCirculars(circulars, 'number').map((ac) => ac.id)).toEqual([
      'middle',
      'new',
      'old',
    ]);
    expect(sortAdvisoryCirculars(circulars, 'title').map((ac) => ac.id)).toEqual([
      'new',
      'middle',
      'old',
    ]);
  });
});
