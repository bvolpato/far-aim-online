import { describe, expect, it } from 'vitest';
import { findGlossaryTerm, searchGlossaryTerms } from './glossary';

const terms = [
  { term: 'MARKER BEACON', definition: 'Definition' },
  { term: 'AIR TRAFFIC [ICAO]', definition: 'ICAO definition' },
];

describe('findGlossaryTerm', () => {
  it('resolves underscore-separated glossary references', () => {
    expect(findGlossaryTerm(terms, 'MARKER_BEACON')?.term).toBe('MARKER BEACON');
  });

  it('resolves ICAO references after normalization', () => {
    expect(findGlossaryTerm(terms, 'AIR_TRAFFIC', true)?.term).toBe('AIR TRAFFIC [ICAO]');
  });
});

describe('searchGlossaryTerms', () => {
  it('ranks an exact term above definition-only matches', () => {
    const searchableTerms = [
      { term: 'BEACON', definition: 'Includes a middle marker.' },
      { term: 'MIDDLE MARKER', definition: 'A marker beacon.' },
    ];

    expect(searchGlossaryTerms(searchableTerms, 'MIDDLE MARKER').map((term) => term.term)).toEqual([
      'MIDDLE MARKER',
      'BEACON',
    ]);
  });
});
