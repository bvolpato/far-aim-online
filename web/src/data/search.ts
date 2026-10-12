import manifestData from './generated/search-manifest.json';

export interface SearchResult {
  type: 'far' | 'aim' | 'flashcard' | 'pcg' | 'ac';
  title: string;
  content: string;
  reference: string;
  link: string;
}

interface SearchCollection {
  count: number;
  metadata: string[];
  parts: number[][];
  prefixes: Record<string, string>;
}

interface SearchManifest {
  chunkSize: number;
  chunkOverlap: number;
  documentGroupSize: number;
  pilotParts: number[];
  collections: Record<string, SearchCollection>;
}

type SearchIndex = Record<string, [id: number, weight: number, position: number][]>;
type SearchDocument = [title: string, reference: string, link: string, chunks: string[]];

interface ScoredResult extends SearchResult {
  score: number;
  position: number;
  chunks: string[];
}

interface RankedDocument {
  category: string;
  collection: SearchCollection;
  id: number;
  score: number;
  position: number;
}

interface SearchOptions {
  onProgress?: (results: SearchResult[], total: number) => void;
  signal?: AbortSignal;
  snippetLimit?: number;
  resultLimit?: number;
}

const manifest: SearchManifest = manifestData;
const requests = new Map<string, Promise<unknown>>();
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'or', 'this', 'which', 'not', 'but', 'can', 'all', 'any',
]);

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word)))];
}

function loadJSON<T>(filename: string): Promise<T> {
  const cached = requests.get(filename);
  if (cached) return cached as Promise<T>;
  const request = fetch(`/search/${filename}`).then(async response => {
    if (!response.ok) throw new Error(`Failed to load search data: ${filename}`);
    return await response.json() as T;
  }).catch((error: unknown) => {
    requests.delete(filename);
    throw error;
  });
  requests.set(filename, request);
  // HTTP caching retains evicted files without growing session memory indefinitely.
  if (requests.size > 128) requests.delete(requests.keys().next().value!);
  return request;
}

function shardFiles(shards: Record<string, string>, token: string): string[] {
  const exact = shards[`${token}$`];
  if (exact) return [exact];
  return Object.entries(shards).filter(([prefix]) => {
    if (prefix.endsWith('$')) return prefix.slice(0, -1).startsWith(token);
    return token.startsWith(prefix) || prefix.startsWith(token);
  }).map(([, filename]) => filename);
}

function topResults(results: RankedDocument[]): RankedDocument[] {
  return [...results].sort((a, b) => b.score - a.score || a.category.localeCompare(b.category) || a.id - b.id).slice(0, 50);
}

function publicResults(results: ScoredResult[]): SearchResult[] {
  return results.map(({ score: _score, position: _position, chunks: _chunks, ...result }) => result);
}

async function searchCollection(
  category: string,
  tokens: string[],
  allowedFarParts: ReadonlySet<number> | undefined,
  signal?: AbortSignal,
): Promise<RankedDocument[]> {
  if (category === 'far' && allowedFarParts?.size === 0) return [];
  const pilotOnly = category === 'far' && allowedFarParts !== undefined
    && [...allowedFarParts].every(part => manifest.pilotParts.includes(part));
  const collection = manifest.collections[pilotOnly ? 'far-pilot' : category];
  if (!collection) return [];
  const prefixes = [...new Set(tokens.map(token => token.slice(0, 2)))];
  if (prefixes.some(prefix => !collection.prefixes[prefix])) return [];
  const lookups = await Promise.all(prefixes.map(prefix => loadJSON<Record<string, string>>(collection.prefixes[prefix])));
  signal?.throwIfAborted();
  const lookup = Object.assign({}, ...lookups) as Record<string, string>;
  const filesByToken = tokens.map(token => shardFiles(lookup, token));
  if (filesByToken.some(files => files.length === 0)) return [];
  const files = [...new Set(filesByToken.flat())];
  const shards = await Promise.all(files.map(file => loadJSON<SearchIndex>(file)));
  signal?.throwIfAborted();
  const index: SearchIndex = Object.assign(Object.create(null), ...shards);
  const matches = tokens.map(token => {
    const exact = index[token];
    const postings = exact || Object.entries(index).filter(([word]) => word.startsWith(token)).flatMap(([, rows]) => rows);
    const documents = new Map<number, { score: number; position: number }>();
    // Prefix variants can refer to the same document. Use its strongest match once.
    for (const [id, weight, position] of postings) {
      const score = weight / 100 * (exact ? 1 : 0.2);
      if (score > (documents.get(id)?.score ?? -1)) documents.set(id, { score, position });
    }
    const idf = Math.log(1 + collection.count / Math.max(1, documents.size));
    for (const match of documents.values()) match.score *= idf;
    return documents;
  }).sort((a, b) => a.size - b.size);
  if (!matches[0]?.size) return [];
  const allowedRanges = category === 'far' && allowedFarParts
    ? collection.parts.filter(([part]) => allowedFarParts.has(part)) : undefined;
  const matchingIds = [...matches[0].keys()].filter(id => matches.every(match => match.has(id))
    && (!allowedRanges || allowedRanges.some(([, firstId, lastId]) => id >= firstId && id <= lastId)));
  return matchingIds.map(id => {
    const bestMatch = matches.map(match => match.get(id)!).sort((a, b) => b.score - a.score)[0];
    return {
      category,
      collection,
      id,
      position: bestMatch.position,
      score: matches.reduce((sum, match) => sum + match.get(id)!.score, 0),
    };
  });
}

async function loadResult(result: RankedDocument): Promise<ScoredResult> {
  const group = Math.floor(result.id / manifest.documentGroupSize);
  const documents = await loadJSON<SearchDocument[]>(result.collection.metadata[group]);
  const [title, reference, link, chunks] = documents[result.id % manifest.documentGroupSize];
  return {
    type: result.category === 'flashcards' ? 'flashcard' : result.category as SearchResult['type'],
    title, reference, link, chunks, content: '', position: result.position, score: result.score,
  };
}

async function loadSnippet(result: ScoredResult): Promise<void> {
  const chunkIndex = Math.floor(result.position / manifest.chunkSize);
  const filename = result.chunks[chunkIndex];
  if (!filename) return;
  try {
    const content = await loadJSON<string>(filename);
    const chunkStart = Math.max(0, chunkIndex * manifest.chunkSize - manifest.chunkOverlap);
    const position = result.position - chunkStart;
    let start = Math.max(0, position - 65);
    let end = Math.min(content.length, position + 135);
    const minimumStart = Math.max(0, start - 30);
    while (start > minimumStart && !/\s/.test(content[start - 1])) start--;
    const maximumEnd = Math.min(content.length, end + 30);
    while (end < maximumEnd && !/\s/.test(content[end])) end++;
    result.content = `${start > 0 || chunkStart > 0 ? '…' : ''}${content.slice(start, end).replace(/\s+/g, ' ').trim()}${end < content.length ? '…' : ''}`;
  } catch {
    result.content = 'Matching passage could not be loaded. Open the result to read it.';
  }
}

export async function searchContent(
  query: string,
  categories: string[] = ['far', 'aim'],
  allowedFarParts?: ReadonlySet<number>,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const tokens = tokenize(query);
  options.signal?.throwIfAborted();
  if (tokens.length === 0 || categories.length === 0) return [];
  const allResults: RankedDocument[] = [];
  const completed = await Promise.allSettled([...new Set(categories)].map(async category => {
    const results = await searchCollection(category, tokens, allowedFarParts, options.signal);
    options.signal?.throwIfAborted();
    allResults.push(...results);
  }));
  options.signal?.throwIfAborted();
  const ranked = topResults(allResults);
  const results = await Promise.all(ranked.slice(0, options.resultLimit ?? 50).map(loadResult));
  options.signal?.throwIfAborted();
  options.onProgress?.(publicResults(results), ranked.length);
  await Promise.all(results.slice(0, options.snippetLimit ?? 10).map(async result => {
    await loadSnippet(result);
    if (!options.signal?.aborted) options.onProgress?.(publicResults(results), ranked.length);
  }));
  options.signal?.throwIfAborted();
  const failure = completed.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return publicResults(results);
}
