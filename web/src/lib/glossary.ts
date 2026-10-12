import type { PCGTerm } from '../data';

function normalizeGlossaryTerm(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function findGlossaryTerm(
  terms: PCGTerm[],
  reference: string,
  isIcaoTerm = false
) {
  const normalizedReference = normalizeGlossaryTerm(reference);

  if (isIcaoTerm) {
    const icaoReference = `${normalizedReference} [ICAO]`;
    const icaoTerm = terms.find((term) => {
      const normalizedTerm = normalizeGlossaryTerm(term.term);
      return normalizedTerm === icaoReference || normalizedTerm.startsWith(icaoReference);
    });

    if (icaoTerm) {
      return icaoTerm;
    }
  }

  return terms.find((term) => {
    const normalizedTerm = normalizeGlossaryTerm(term.term);
    return normalizedTerm === normalizedReference || normalizedTerm.startsWith(normalizedReference);
  });
}

export function searchGlossaryTerms(terms: PCGTerm[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return terms;

  const rank = (term: PCGTerm) => {
    const label = term.term.toLowerCase();
    if (label === normalizedQuery) return 0;
    if (label.startsWith(normalizedQuery)) return 1;
    if (label.includes(normalizedQuery)) return 2;
    return 3;
  };

  return terms
    .filter((term) =>
      term.term.toLowerCase().includes(normalizedQuery) ||
      term.definition.toLowerCase().includes(normalizedQuery)
    )
    .sort((left, right) => rank(left) - rank(right) || left.term.localeCompare(right.term));
}
