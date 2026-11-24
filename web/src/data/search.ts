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

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word)))];
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
  if (exact) return [exact];
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
    && [...allowedFarParts].every(part => PILOT_PARTS_SET.has(part));
  const collection = manifest.collections[pilotOnly ? 'far-pilot' : category];
  if (!collection) return [];

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
      return [];
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
    if (files.length === 0) return [];
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

  const matches = tokens.map((token, tokenIndex) => {
    const documents = new Map<number, { score: number; position: number }>();
    const tokenFiles = filesByToken[tokenIndex];
    let exactPostings: SearchPosting[] | undefined;

    for (const file of tokenFiles) {
      const shard = shardByFile.get(file)!;
      if (Object.prototype.hasOwnProperty.call(shard, token)) {
        exactPostings = shard[token];
        break;
      }
    }

    if (exactPostings) {
      for (const [id, weight, position] of exactPostings) {
        const score = weight / 100;
        const existing = documents.get(id);
        if (!existing || score > existing.score) documents.set(id, { score, position });
      }
    } else {
      // Prefix variants can refer to the same document. Use its strongest match once.
      for (const file of tokenFiles) {
        const shard = shardByFile.get(file)!;
        for (const word of Object.keys(shard)) {
          if (!word.startsWith(token)) continue;
          for (const [id, weight, position] of shard[word]) {
            const score = (weight / 100) * 0.2;
            const existing = documents.get(id);
            if (!existing || score > existing.score) documents.set(id, { score, position });
          }
        }
      }
    }

    const idf = Math.log(1 + collection.count / Math.max(1, documents.size));
    for (const match of documents.values()) match.score *= idf;
    return documents;
  }).sort((a, b) => a.size - b.size);

  if (!matches[0]?.size) return [];
  const allowedRanges = category === 'far' && allowedFarParts
    ? collection.parts.filter(([part]) => allowedFarParts.has(part)) : undefined;

  const ranked: RankedDocument[] = [];
  for (const id of matches[0].keys()) {
    if (allowedRanges && !allowedRanges.some(([, firstId, lastId]) => id >= firstId && id <= lastId)) {
      continue;
    }
    let allPresent = true;
    let totalScore = 0;
    let bestScore = -1;
    let bestPosition = 0;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i].get(id);
      if (!match) {
        allPresent = false;
        break;
      }
      totalScore += match.score;
      if (match.score > bestScore) {
        bestScore = match.score;
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

async function loadSnippet(result: ScoredResult): Promise<void> {
  const chunkIndex = Math.floor(result.position / manifest.chunkSize);
  const chunkRef = result.chunks[chunkIndex];
  if (!chunkRef) return;
  try {
    const content = Array.isArray(chunkRef)
      ? (await loadJSON<string[]>(chunkRef[0]))[chunkRef[1]]
      : await loadJSON<string>(chunkRef);
    if (typeof content !== 'string') return;
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

  let progressScheduled = false;
  const scheduleProgress = () => {
    if (!options.onProgress || progressScheduled || options.signal?.aborted) return;
    progressScheduled = true;
    queueMicrotask(() => {
      progressScheduled = false;
      if (!options.signal?.aborted) options.onProgress?.(publicResults(results), ranked.length);
    });
  };

  await Promise.all(results.slice(0, options.snippetLimit ?? 10).map(async result => {
    if (options.signal?.aborted) return;
    await loadSnippet(result);
    scheduleProgress();
  }));
  options.signal?.throwIfAborted();
  if (progressScheduled) {
    progressScheduled = false;
    options.onProgress?.(publicResults(results), ranked.length);
  }
  const failure = completed.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return publicResults(results);
}
