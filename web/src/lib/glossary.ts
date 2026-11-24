import type { PCGTerm } from '../data/types';

interface GlossaryLookup {
  exactMap: Map<string, PCGTerm>;
  normalized: Array<{ norm: string; term: PCGTerm }>;
  searchable: Array<{ term: PCGTerm; lowerTerm: string; lowerDef: string }>;
}

const lookupCache = new WeakMap<PCGTerm[], GlossaryLookup>();

function normalizeGlossaryTerm(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function getGlossaryLookup(terms: PCGTerm[]): GlossaryLookup {
  const cached = lookupCache.get(terms);
  if (cached) return cached;

  const exactMap = new Map<string, PCGTerm>();
  const normalized: Array<{ norm: string; term: PCGTerm }> = new Array(terms.length);
  const searchable: Array<{ term: PCGTerm; lowerTerm: string; lowerDef: string }> = new Array(terms.length);

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const norm = normalizeGlossaryTerm(term.term);
    if (!exactMap.has(norm)) exactMap.set(norm, term);
    normalized[i] = { norm, term };
    searchable[i] = {
      term,
      lowerTerm: term.term.toLowerCase(),
      lowerDef: term.definition.toLowerCase(),
    };
  }

  const lookup: GlossaryLookup = { exactMap, normalized, searchable };
  lookupCache.set(terms, lookup);
  return lookup;
}

export function findGlossaryTerm(
  terms: PCGTerm[],
  reference: string,
  isIcaoTerm = false
) {
  const normalizedReference = normalizeGlossaryTerm(reference);
  const lookup = getGlossaryLookup(terms);

  if (isIcaoTerm) {
    const icaoReference = `${normalizedReference} [ICAO]`;
    const exactIcao = lookup.exactMap.get(icaoReference);
    if (exactIcao) return exactIcao;

    const prefixIcao = lookup.normalized.find((entry) => entry.norm.startsWith(icaoReference));
    if (prefixIcao) return prefixIcao.term;
  }

  const exact = lookup.exactMap.get(normalizedReference);
  if (exact) return exact;

  const prefix = lookup.normalized.find((entry) => entry.norm.startsWith(normalizedReference));
  return prefix?.term;
}

export function searchGlossaryTerms(terms: PCGTerm[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return terms;

  const { searchable } = getGlossaryLookup(terms);
  const matched: Array<{ term: PCGTerm; rank: number }> = [];

  for (let i = 0; i < searchable.length; i++) {
    const entry = searchable[i];
    if (entry.lowerTerm === normalizedQuery) {
      matched.push({ term: entry.term, rank: 0 });
    } else if (entry.lowerTerm.startsWith(normalizedQuery)) {
      matched.push({ term: entry.term, rank: 1 });
    } else if (entry.lowerTerm.includes(normalizedQuery)) {
      matched.push({ term: entry.term, rank: 2 });
    } else if (entry.lowerDef.includes(normalizedQuery)) {
      matched.push({ term: entry.term, rank: 3 });
    }
  }

  matched.sort((left, right) => left.rank - right.rank || left.term.term.localeCompare(right.term.term));
  return matched.map((entry) => entry.term);
}
