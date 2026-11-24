const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'web/public/search');
const MANIFEST = path.join(ROOT, 'web/src/data/generated/search-manifest.json');
const MAX_SHARD_BYTES = 96 * 1024;
const TARGET_PACK_BYTES = 32 * 1024;
const CHUNK_SIZE = 8192;
const CHUNK_OVERLAP = 200;
const DOCUMENT_GROUP_SIZE = 64;
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
const CATEGORY_ALIASES = {
  far: 'far 14 cfr',
  aim: 'aim',
  ac: 'ac advisory circular',
  pcg: 'pcg glossary',
  flashcards: 'flashcard',
};

function isIndexableToken(token) {
  return (token.length >= 3 && !STOP_WORDS.has(token))
    || /^\d{2}$/.test(token)
    || AVIATION_TWO_CHAR_TOKENS.has(token);
}

function createWebSearchBuilder({ check = false } = {}) {
  const pilotParts = require('../data/far/pilot-index.json').parts.map(part => part.part);
  const pilotSet = new Set(pilotParts);
  const collections = new Map();
  const expectedFiles = new Set();
  const createdDirs = new Set();

  // Deduplicate content chunks and pack small chunks into ~24 KB bundles to cut
  // file count and filesystem block waste while keeping cold snippet fetches compact.
  const uniqueChunks = [];
  const chunkKeyToId = new Map();

  function ensureDir(dir) {
    if (createdDirs.has(dir)) return;
    fs.mkdirSync(dir, { recursive: true });
    createdDirs.add(dir);
  }

  function writeFile(file, text, { contentAddressed = false } = {}) {
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
        throw new Error(`Stale generated search artifact: ${path.relative(ROOT, file)}`);
      }
      return;
    }
    if (contentAddressed && fs.existsSync(file)) {
      return;
    }
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, text);
  }

  function writeArtifact(name, data) {
    const text = JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    const filename = `${name}-${hash}.json`;
    if (!expectedFiles.has(filename)) {
      writeFile(path.join(OUTPUT, filename), text, { contentAddressed: true });
      expectedFiles.add(filename);
    }
    return filename;
  }

  function registerChunk(excerpt) {
    const hash = crypto.createHash('sha256').update(excerpt).digest('hex');
    let chunkId = chunkKeyToId.get(hash);
    if (chunkId === undefined) {
      chunkId = uniqueChunks.length;
      uniqueChunks.push(excerpt);
      chunkKeyToId.set(hash, chunkId);
    }
    return chunkId;
  }

  function collectionFor(category) {
    if (!collections.has(category)) collections.set(category, { documents: [], parts: [], tokens: new Map() });
    return collections.get(category);
  }

  function addDocument(category, { title, content, reference, link }) {
    const farPartNum = category === 'far' ? Number(link.match(/^\/far\/(\d+)/)?.[1]) : NaN;
    const targets = [collectionFor(category)];
    if (category === 'far' && pilotSet.has(farPartNum)) {
      targets.push(collectionFor('far-pilot'));
    }
    const chunkIds = [];
    for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
      // Overlap preserves complete search excerpts when a match lies on a chunk boundary.
      const excerpt = content.slice(Math.max(0, offset - CHUNK_OVERLAP), offset + CHUNK_SIZE + CHUNK_OVERLAP);
      chunkIds.push(registerChunk(excerpt));
    }
    const occurrences = new Map();
    const recordOccurrence = (token, inTitle, position) => {
      if (!isIndexableToken(token)) return;
      const occurrence = occurrences.get(token);
      if (occurrence) {
        occurrence.count++;
        occurrence.title ||= inTitle;
        if (!inTitle && occurrence.position === null) occurrence.position = position;
      } else {
        occurrences.set(token, { count: 1, title: inTitle, position: inTitle ? null : position });
      }
    };

    const headerText = `${title} ${reference || ''} ${CATEGORY_ALIASES[category] || ''}`;
    const combinedText = `${headerText}\n${content}`;
    const bodyStart = headerText.length + 1;

    for (const match of combinedText.matchAll(/\S+/g)) {
      const raw = match[0];
      const inTitle = match.index < headerText.length;
      const position = inTitle ? 0 : Math.max(0, match.index - bodyStart);
      const lower = raw.toLowerCase();
      const cleaned = lower.replace(/[^\w]/g, '');
      recordOccurrence(cleaned, inTitle, position);

      // Preserve AIM section numbers (e.g. 4-3-2 -> 4_3_2) separately from FAR 43.2 -> 432.
      const strippedEdges = lower.replace(/^[^\w]+|[^\w]+$/g, '');
      if (/^\d{1,2}-\d{1,2}-\d{1,2}$/.test(strippedEdges)) {
        recordOccurrence(strippedEdges.replace(/-/g, '_'), inTitle, position);
      }

      // Split hyphen/slash compounds (e.g. cross-country -> cross, country) so both forms match.
      if (raw.includes('-') || raw.includes('/')) {
        for (const sub of lower.split(/[-/]+/)) {
          const subClean = sub.replace(/[^\w]/g, '');
          if (subClean && subClean !== cleaned) {
            recordOccurrence(subClean, inTitle, position);
          }
        }
      }
    }

    // Index airspace class bigrams (e.g. "Class B" -> "class_b") so single-letter classes remain searchable.
    for (const match of combinedText.matchAll(/\bclass\s+([a-g])\b/gi)) {
      const inTitle = match.index < headerText.length;
      const position = inTitle ? 0 : Math.max(0, match.index - bodyStart);
      recordOccurrence(`class_${match[1].toLowerCase()}`, inTitle, position);
    }
    for (const collection of targets) {
      const id = collection.documents.length;
      collection.documents.push([title, reference, link, chunkIds]);
      if (category === 'far') {
        const previous = collection.parts.at(-1);
        if (previous?.[0] === farPartNum) previous[2] = id;
        else collection.parts.push([farPartNum, id, id]);
      }
      for (const [token, occurrence] of occurrences) {
        let postingList = collection.tokens.get(token);
        if (!postingList) {
          postingList = [];
          collection.tokens.set(token, postingList);
        }
        // Calculate term frequency and title weight once, rather than scanning full text in the browser.
        const weight = Math.round((1.5 + Math.log(occurrence.count) + (occurrence.title ? 3 : 0)) * 100);
        postingList.push([id, weight, occurrence.position ?? 0]);
      }
    }
  }

  function writeContentPacks() {
    const chunkRefById = new Array(uniqueChunks.length);
    let packChunks = [];
    let packIds = [];
    let packBytes = 2; // "[]"

    function flushPack() {
      if (packChunks.length === 0) return;
      const filename = writeArtifact('content/pack', packChunks);
      for (let index = 0; index < packIds.length; index++) {
        chunkRefById[packIds[index]] = [filename, index];
      }
      packChunks = [];
      packIds = [];
      packBytes = 2;
    }

    for (let id = 0; id < uniqueChunks.length; id++) {
      const chunk = uniqueChunks[id];
      const estimatedBytes = Buffer.byteLength(chunk) + 4;
      if (packChunks.length > 0 && packBytes + estimatedBytes > TARGET_PACK_BYTES) {
        flushPack();
      }
      packChunks.push(chunk);
      packIds.push(id);
      packBytes += estimatedBytes;
    }
    flushPack();
    return chunkRefById;
  }

  function write() {
    const chunkRefById = writeContentPacks();
    const manifest = {
      version: 2,
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
      documentGroupSize: DOCUMENT_GROUP_SIZE,
      pilotParts,
      collections: {},
    };

    for (const [category, collection] of collections) {
      const direct = {};
      const prefixes = {};
      const rootBuckets = new Map();
      for (const token of [...collection.tokens.keys()].sort()) {
        const p1 = token.slice(0, 1);
        let list = rootBuckets.get(p1);
        if (!list) {
          list = [];
          rootBuckets.set(p1, list);
        }
        list.push(token);
      }

      let shardCount = 0;
      for (const [p1, p1Tokens] of rootBuckets) {
        const p1Postings = Object.fromEntries(p1Tokens.map(token => [token, collection.tokens.get(token)]));
        if (Buffer.byteLength(JSON.stringify(p1Postings)) <= MAX_SHARD_BYTES || p1Tokens.length <= 1) {
          direct[p1] = writeArtifact(`${category}/${p1}`, p1Postings);
          shardCount++;
          continue;
        }

        const p2Buckets = new Map();
        for (const token of p1Tokens) {
          const p2 = token.slice(0, 2);
          let list = p2Buckets.get(p2);
          if (!list) {
            list = [];
            p2Buckets.set(p2, list);
          }
          list.push(token);
        }

        for (const [rootPrefix, rootTokens] of p2Buckets) {
          const shards = {};
          function writeShard(prefix, tokens) {
            const postings = Object.fromEntries(tokens.map(token => [token, collection.tokens.get(token)]));
            if (Buffer.byteLength(JSON.stringify(postings)) > MAX_SHARD_BYTES && tokens.length > 1) {
              const children = new Map();
              for (const token of tokens) {
                const child = token.slice(0, prefix.length + 1);
                let list = children.get(child);
                if (!list) {
                  list = [];
                  children.set(child, list);
                }
                list.push(token);
              }
              if (children.size > 1) {
                for (const [child, childTokens] of children) {
                  if (child === prefix) {
                    shards[`${prefix}$`] = writeArtifact(`${category}/${prefix}-exact`, {
                      [childTokens[0]]: collection.tokens.get(childTokens[0]),
                    });
                    shardCount++;
                  } else {
                    writeShard(child, childTokens);
                  }
                }
                return;
              }
              writeShard(tokens[0].slice(0, prefix.length + 1), tokens);
              return;
            }
            shards[prefix] = writeArtifact(`${category}/${prefix}`, postings);
            shardCount++;
          }

          writeShard(rootPrefix, rootTokens);
          const shardKeys = Object.keys(shards);
          if (shardKeys.length === 1 && shardKeys[0] === rootPrefix) {
            // Single-shard 2-char bucket: skip Stage-1 lookup indirection completely.
            direct[rootPrefix] = shards[rootPrefix];
          } else {
            prefixes[rootPrefix] = writeArtifact(`${category}/lookup-${rootPrefix}`, shards);
          }
        }
      }

      const metadata = [];
      for (let offset = 0; offset < collection.documents.length; offset += DOCUMENT_GROUP_SIZE) {
        const group = collection.documents.slice(offset, offset + DOCUMENT_GROUP_SIZE).map(
          ([title, reference, link, chunkIds]) => [
            title,
            reference,
            link,
            chunkIds.map(id => chunkRefById[id]),
          ],
        );
        metadata.push(writeArtifact(`${category}/documents-${offset / DOCUMENT_GROUP_SIZE}`, group));
      }

      manifest.collections[category] = {
        count: collection.documents.length,
        metadata,
        parts: collection.parts,
        direct,
        prefixes,
      };
      console.log(`[web/${category}] ${collection.documents.length} documents in ${shardCount} query shards.`);
    }

    writeFile(MANIFEST, `${JSON.stringify(manifest)}\n`);
    if (!check) {
      // Remove only obsolete JSON in this generator's dedicated output directory.
      for (const filename of fs.readdirSync(OUTPUT, { recursive: true })) {
        if (filename.endsWith('.json') && !expectedFiles.has(filename)) {
          fs.unlinkSync(path.join(OUTPUT, filename));
        }
      }
    }
  }

  return { addDocument, write };
}

module.exports = { createWebSearchBuilder };
