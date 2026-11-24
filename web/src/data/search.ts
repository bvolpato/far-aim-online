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
  direct?: Record<string, string>;
  prefixes: Record<string, string>;
}

interface SearchManifest {
  chunkSize: number;
  chunkOverlap: number;
  documentGroupSize: number;
  pilotParts: number[];
  collections: Record<string, SearchCollection>;
}

type SearchPosting = [id: number, weight: number, position: number];
type SearchIndex = Record<string, SearchPosting[]>;
type ChunkRef = string | [packFile: string, index: number];
type SearchDocument = [title: string, reference: string, link: string, chunks: ChunkRef[]];

interface ScoredResult extends SearchResult {
  score: number;
  position: number;
  chunks: ChunkRef[];
}

interface RankedDocument {
  category: string;
  collection: SearchCollection;
  id: number;
  score: number;
  position: number;
}

interface CollectionMatchSet {
  category: string;
  collection: SearchCollection;
  tokenMaps: Map<number, { weight: number; position: number }>[];
  allowedRanges?: number[][];
}

interface SearchOptions {
  onProgress?: (results: SearchResult[], total: number) => void;
  signal?: AbortSignal;
  snippetLimit?: number;
  resultLimit?: number;
}

const manifest: SearchManifest = manifestData as unknown as SearchManifest;
const PILOT_PARTS_SET = new Set(manifest.pilotParts);
const requests = new Map<string, Promise<unknown>>();
const MAX_CACHED_REQUESTS = 128;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'or', 'this', 'which', 'not', 'but', 'can', 'all', 'any',
]);
const AVIATION_TWO_CHAR_TOKENS = new Set([
  'ac', 'ad', 'af', 'at', 'cg', 'cl', 'da', 'dg', 'dh', 'dp', 'el', 'ga', 'gs',
  'hf', 'hz', 'ia', 'if', 'im', 'ir', 'lf', 'mm', 'no', 'om', 'pt', 'rc', 'rv',
  'sn', 't1', 'tf', 'vr', 'wa', 'ws', 'wx',
]);

function isSearchableToken(token: string): boolean {
  return (token.length >= 3 && !STOP_WORDS.has(token))
    || /^\d{2}$/.test(token)
    || AVIATION_TWO_CHAR_TOKENS.has(token);
}

export function tokenizeSearchQuery(text: string): string[] {
  const tokens = new Set<string>();
  const remaining = text.replace(/\bclass\s+([a-g])\b/gi, (_, letter: string) => {
    tokens.add(`class_${letter.toLowerCase()}`);
    return ' ';
  });

  for (const match of remaining.matchAll(/\S+/g)) {
    const lower = match[0].toLowerCase();
    const strippedEdges = lower.replace(/^[^\w]+|[^\w]+$/g, '');
    if (/^\d{1,2}-\d{1,2}-\d{1,2}$/.test(strippedEdges)) {
      tokens.add(strippedEdges.replace(/-/g, '_'));
      continue;
    }
    const cleaned = lower.replace(/[^\w]/g, '');
    if (isSearchableToken(cleaned)) {
      tokens.add(cleaned);
    }
  }

  return [...tokens];
}

function loadJSON<T>(filename: string): Promise<T> {
  const cached = requests.get(filename);
  if (cached) {
    // Refresh recency for LRU retention of hot shards and packs.
    requests.delete(filename);
    requests.set(filename, cached);
    return cached as Promise<T>;
  }
  const request = fetch(`/search/${filename}`).then(async response => {
    if (!response.ok) throw new Error(`Failed to load search data: ${filename}`);
    return await response.json() as T;
  }).catch((error: unknown) => {
    requests.delete(filename);
    throw error;
  });
  requests.set(filename, request);
  // HTTP caching retains evicted files without growing session memory indefinitely.
  if (requests.size > MAX_CACHED_REQUESTS) requests.delete(requests.keys().next().value!);
  return request;
}

function shardFiles(shards: Record<string, string>, token: string): string[] {
  const exact = shards[`${token}$`];
  const isNumericIdentifier = /^\d{3,}$/.test(token);
  if (exact && !isNumericIdentifier) return [exact];
  const matched: string[] = [];
  for (const [prefix, filename] of Object.entries(shards)) {
    if (prefix.endsWith('$')) {
      if (prefix.slice(0, -1).startsWith(token)) matched.push(filename);
    } else if (token.startsWith(prefix) || prefix.startsWith(token)) {
      matched.push(filename);
    }
  }
  return matched;
}

function topResults(results: RankedDocument[], limit: number): RankedDocument[] {
  return [...results]
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category) || a.id - b.id)
    .slice(0, limit);
}

function publicResults(results: ScoredResult[]): SearchResult[] {
  return results.map(({ score: _score, position: _position, chunks: _chunks, ...result }) => result);
}

async function collectCollectionMatches(
  category: string,
  tokens: string[],
  allowedFarParts: ReadonlySet<number> | undefined,
  signal?: AbortSignal,
): Promise<CollectionMatchSet | null> {
  if (category === 'far' && allowedFarParts?.size === 0) return null;
  const pilotOnly = category === 'far' && allowedFarParts !== undefined
    && [...allowedFarParts].every(part => PILOT_PARTS_SET.has(part));
  const collection = manifest.collections[pilotOnly ? 'far-pilot' : category];
  if (!collection) return null;

  const direct = collection.direct;
  const lookupPrefixesNeeded = new Set<string>();
  const directFileByToken = new Array<string | undefined>(tokens.length);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const p1 = token.slice(0, 1);
    const p2 = token.slice(0, 2);
    const directShard = direct?.[p1] ?? direct?.[p2];
    if (directShard) {
      directFileByToken[i] = directShard;
    } else if (collection.prefixes[p2]) {
      lookupPrefixesNeeded.add(p2);
    } else {
      return null;
    }
  }

  const lookupByPrefix = new Map<string, Record<string, string>>();
  if (lookupPrefixesNeeded.size > 0) {
    const prefixList = [...lookupPrefixesNeeded];
    const lookups = await Promise.all(prefixList.map(prefix => loadJSON<Record<string, string>>(collection.prefixes[prefix])));
    signal?.throwIfAborted();
    for (let i = 0; i < prefixList.length; i++) {
      lookupByPrefix.set(prefixList[i], lookups[i]);
    }
  }

  const filesByToken: string[][] = new Array(tokens.length);
  const uniqueShardFiles = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const directShard = directFileByToken[i];
    const files = directShard ? [directShard] : shardFiles(lookupByPrefix.get(tokens[i].slice(0, 2))!, tokens[i]);
    if (files.length === 0) return null;
    filesByToken[i] = files;
    for (const file of files) uniqueShardFiles.add(file);
  }

  const uniqueFileList = [...uniqueShardFiles];
  const loadedShards = await Promise.all(uniqueFileList.map(file => loadJSON<SearchIndex>(file)));
  signal?.throwIfAborted();

  const shardByFile = new Map<string, SearchIndex>();
  for (let i = 0; i < uniqueFileList.length; i++) {
    shardByFile.set(uniqueFileList[i], loadedShards[i]);
  }

  const tokenMaps = tokens.map((token, tokenIndex) => {
    const documents = new Map<number, { weight: number; position: number }>();
    const tokenFiles = filesByToken[tokenIndex];
    let exactPostings: SearchPosting[] | undefined;

    for (const file of tokenFiles) {
      const shard = shardByFile.get(file)!;
      if (Object.prototype.hasOwnProperty.call(shard, token)) {
        exactPostings = shard[token];
        break;
      }
    }

    const addPostings = (postings: SearchPosting[], multiplier: number) => {
      for (const [id, rawWeight, position] of postings) {
        const weight = (rawWeight / 100) * multiplier;
        const existing = documents.get(id);
        if (!existing || weight > existing.weight) documents.set(id, { weight, position });
      }
    };

    if (exactPostings) {
      addPostings(exactPostings, 1);

      // Include AC revision suffixes (e.g. 9157 -> 9157d) and simple plurals already in the loaded shards
      // so an incidental exact token never shadows active revised circulars or plural forms.
      const isNumericIdentifier = /^\d{3,}$/.test(token);
      const pluralS = token.length >= 4 && !token.endsWith('s') ? `${token}s` : '';
      const pluralEs = token.length >= 4 && !token.endsWith('s') ? `${token}es` : '';

      for (const file of tokenFiles) {
        const shard = shardByFile.get(file)!;
        if (isNumericIdentifier) {
          for (const word of Object.keys(shard)) {
            if (word.length > token.length && word.startsWith(token) && /^[a-z]/.test(word.slice(token.length))) {
              addPostings(shard[word], 0.75);
            }
          }
        } else {
          if (pluralS && Object.prototype.hasOwnProperty.call(shard, pluralS)) {
            addPostings(shard[pluralS], 0.65);
          }
          if (pluralEs && Object.prototype.hasOwnProperty.call(shard, pluralEs)) {
            addPostings(shard[pluralEs], 0.65);
          }
        }
      }
    } else {
      // Prefix variants can refer to the same document. Use its strongest match once.
      for (const file of tokenFiles) {
        const shard = shardByFile.get(file)!;
        for (const word of Object.keys(shard)) {
          if (!word.startsWith(token)) continue;
          addPostings(shard[word], 0.2);
        }
      }
    }

    return documents;
  });

  if (tokenMaps.some(map => map.size === 0)) return null;

  const allowedRanges = category === 'far' && allowedFarParts
    ? collection.parts.filter(([part]) => allowedFarParts.has(part)) : undefined;

  return { category, collection, tokenMaps, allowedRanges };
}

function rankCollectionMatches(
  matchSet: CollectionMatchSet,
  globalIdfs: number[],
): RankedDocument[] {
  const { category, collection, tokenMaps, allowedRanges } = matchSet;
  const order = tokenMaps
    .map((map, index) => ({ map, idf: globalIdfs[index] }))
    .sort((a, b) => a.map.size - b.map.size);

  const smallest = order[0];
  if (!smallest?.map.size) return [];

  const ranked: RankedDocument[] = [];
  for (const id of smallest.map.keys()) {
    if (allowedRanges && !allowedRanges.some(([, firstId, lastId]) => id >= firstId && id <= lastId)) {
      continue;
    }
    let allPresent = true;
    let totalScore = 0;
    let bestScore = -1;
    let bestPosition = 0;
    for (let i = 0; i < order.length; i++) {
      const match = order[i].map.get(id);
      if (!match) {
        allPresent = false;
        break;
      }
      const score = match.weight * order[i].idf;
      totalScore += score;
      if (score > bestScore || (score === bestScore && bestPosition === 0 && match.position > 0)) {
        bestScore = score;
        bestPosition = match.position;
      }
    }
    if (allPresent) {
      ranked.push({
        category,
        collection,
        id,
        position: bestPosition,
        score: totalScore,
      });
    }
  }
  return ranked;
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

function findBestSnippetPosition(content: string, fallbackPosition: number, queryTerms: string[]): number {
  if (queryTerms.length === 0) return fallbackPosition;
  const lower = content.toLowerCase();
  if (queryTerms.length === 1) {
    if (fallbackPosition > 0 && fallbackPosition < content.length) return fallbackPosition;
    const found = lower.indexOf(queryTerms[0]);
    return found >= 0 ? found : fallbackPosition;
  }

  // Pick a passage in this chunk where the most distinct query terms appear within a 180-char window.
  const hits: { pos: number; termIdx: number }[] = [];
  for (let termIdx = 0; termIdx < queryTerms.length; termIdx++) {
    const term = queryTerms[termIdx];
    let pos = lower.indexOf(term);
    let count = 0;
    while (pos >= 0 && count < 8) {
      hits.push({ pos, termIdx });
      pos = lower.indexOf(term, pos + term.length);
      count++;
    }
  }
  if (hits.length === 0) return fallbackPosition;
  hits.sort((a, b) => a.pos - b.pos);

  let bestPos = hits[0].pos;
  let bestDistinct = 0;
  for (let i = 0; i < hits.length; i++) {
    const seen = new Set<number>([hits[i].termIdx]);
    for (let j = i + 1; j < hits.length && hits[j].pos - hits[i].pos <= 180; j++) {
      seen.add(hits[j].termIdx);
    }
    if (seen.size > bestDistinct) {
      bestDistinct = seen.size;
      bestPos = hits[i].pos;
      if (bestDistinct === queryTerms.length) break;
    }
  }
  return bestPos;
}

async function loadSnippet(result: ScoredResult, queryTerms: string[]): Promise<void> {
  const chunkIndex = Math.floor(result.position / manifest.chunkSize);
  const chunkRef = result.chunks[chunkIndex];
  if (!chunkRef) return;
  try {
    const content = Array.isArray(chunkRef)
      ? (await loadJSON<string[]>(chunkRef[0]))[chunkRef[1]]
      : await loadJSON<string>(chunkRef);
    if (typeof content !== 'string') return;
    const chunkStart = Math.max(0, chunkIndex * manifest.chunkSize - manifest.chunkOverlap);
    const rawPosition = Math.max(0, result.position - chunkStart);
    const position = (queryTerms.length > 1 || rawPosition === 0)
      ? findBestSnippetPosition(content, rawPosition, queryTerms)
      : rawPosition;
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
  const tokens = tokenizeSearchQuery(query);
  options.signal?.throwIfAborted();
  if (tokens.length === 0 || categories.length === 0) return [];

  const uniqueCategories = [...new Set(categories)];
  const matchSets: CollectionMatchSet[] = [];
  const completed = await Promise.allSettled(uniqueCategories.map(async category => {
    const matchSet = await collectCollectionMatches(category, tokens, allowedFarParts, options.signal);
    options.signal?.throwIfAborted();
    if (matchSet) matchSets.push(matchSet);
  }));
  options.signal?.throwIfAborted();

  // Compute global IDF across all active collections so smaller manuals (AIM, PCG, AC)
  // are not penalized against larger catalogs like FAR.
  let totalActiveDocs = 0;
  for (const category of uniqueCategories) {
    const pilotOnly = category === 'far' && allowedFarParts !== undefined
      && [...allowedFarParts].every(part => PILOT_PARTS_SET.has(part));
    const col = manifest.collections[pilotOnly ? 'far-pilot' : category];
    if (col) totalActiveDocs += col.count;
  }
  const globalIdfs = tokens.map((_, tokenIndex) => {
    let globalDf = 0;
    for (const set of matchSets) {
      globalDf += set.tokenMaps[tokenIndex].size;
    }
    return Math.log(1 + Math.max(1, totalActiveDocs) / Math.max(1, globalDf));
  });

  const allResults: RankedDocument[] = [];
  for (const matchSet of matchSets) {
    allResults.push(...rankCollectionMatches(matchSet, globalIdfs));
  }

  const limit = options.resultLimit ?? 50;
  const ranked = topResults(allResults, limit);
  const totalAvailable = allResults.length;
  const results = await Promise.all(ranked.map(loadResult));
  options.signal?.throwIfAborted();
  options.onProgress?.(publicResults(results), totalAvailable);

  const snippetTerms = tokens.map(token => token.replace(/_/g, ' '));
  let progressScheduled = false;
  const scheduleProgress = () => {
    if (!options.onProgress || progressScheduled || options.signal?.aborted) return;
    progressScheduled = true;
    queueMicrotask(() => {
      progressScheduled = false;
      if (!options.signal?.aborted) options.onProgress?.(publicResults(results), totalAvailable);
    });
  };

  await Promise.all(results.slice(0, options.snippetLimit ?? 10).map(async result => {
    if (options.signal?.aborted) return;
    await loadSnippet(result, snippetTerms);
    scheduleProgress();
  }));
  options.signal?.throwIfAborted();
  if (progressScheduled) {
    progressScheduled = false;
    options.onProgress?.(publicResults(results), totalAvailable);
  }
  const failure = completed.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return publicResults(results);
}
