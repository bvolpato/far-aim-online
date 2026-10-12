const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'web/public/search');
const MANIFEST = path.join(ROOT, 'web/src/data/generated/search-manifest.json');
const MAX_SHARD_BYTES = 64 * 1024;
const CHUNK_SIZE = 8192;
const CHUNK_OVERLAP = 200;
const DOCUMENT_GROUP_SIZE = 16;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'or', 'this', 'which', 'not', 'but', 'can', 'all', 'any',
]);

function createWebSearchBuilder({ check = false } = {}) {
  const pilotParts = require('../data/far/pilot-index.json').parts.map(part => part.part);
  const pilotSet = new Set(pilotParts);
  const collections = new Map();
  const expectedFiles = new Set();

  function writeFile(file, text) {
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
        throw new Error(`Stale generated search artifact: ${path.relative(ROOT, file)}`);
      }
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
  }

  function writeArtifact(name, data) {
    const text = JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    const filename = `${name}-${hash}.json`;
    if (!expectedFiles.has(filename)) writeFile(path.join(OUTPUT, filename), text);
    expectedFiles.add(filename);
    return filename;
  }

  function collectionFor(category) {
    if (!collections.has(category)) collections.set(category, { documents: [], parts: [], tokens: new Map() });
    return collections.get(category);
  }

  function addDocument(category, { title, content, reference, link }) {
    const targets = [collectionFor(category)];
    if (category === 'far' && pilotSet.has(Number(link.match(/^\/far\/(\d+)/)?.[1]))) {
      targets.push(collectionFor('far-pilot'));
    }
    const chunks = [];
    for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
      // Overlap preserves complete search excerpts when a match lies on a chunk boundary.
      const excerpt = content.slice(Math.max(0, offset - CHUNK_OVERLAP), offset + CHUNK_SIZE + CHUNK_OVERLAP);
      chunks.push(writeArtifact('content/chunk', excerpt));
    }
    const occurrences = new Map();
    for (const match of `${title} ${content}`.matchAll(/\S+/g)) {
      const token = match[0].toLowerCase().replace(/[^\w]/g, '');
      if (token.length < 3 || STOP_WORDS.has(token)) continue;
      const inTitle = match.index < title.length;
      const position = Math.max(0, match.index - title.length - 1);
      const occurrence = occurrences.get(token);
      if (occurrence) {
        occurrence.count++;
        occurrence.title ||= inTitle;
        if (!inTitle && occurrence.position === null) occurrence.position = position;
      } else {
        occurrences.set(token, { count: 1, title: inTitle, position: inTitle ? null : position });
      }
    }
    for (const collection of targets) {
      const id = collection.documents.length;
      collection.documents.push([title, reference, link, chunks]);
      if (category === 'far') {
        const part = Number(link.match(/^\/far\/(\d+)/)?.[1]);
        const previous = collection.parts.at(-1);
        if (previous?.[0] === part) previous[2] = id;
        else collection.parts.push([part, id, id]);
      }
      for (const [token, occurrence] of occurrences) {
        if (!collection.tokens.has(token)) collection.tokens.set(token, []);
        // Calculate term frequency and title weight once, rather than scanning full text in the browser.
        const weight = Math.round((1.5 + Math.log(occurrence.count) + (occurrence.title ? 3 : 0)) * 100);
        collection.tokens.get(token).push([id, weight, occurrence.position ?? 0]);
      }
    }
  }

  function write() {
    const manifest = { version: 1, chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP, documentGroupSize: DOCUMENT_GROUP_SIZE, pilotParts, collections: {} };
    for (const [category, collection] of collections) {
      const prefixes = {};
      const buckets = new Map();
      for (const token of [...collection.tokens.keys()].sort()) {
        const prefix = token.slice(0, 2);
        if (!buckets.has(prefix)) buckets.set(prefix, []);
        buckets.get(prefix).push(token);
      }
      let shardCount = 0;
      for (const [rootPrefix, rootTokens] of buckets) {
        const shards = {};
        function writeShard(prefix, tokens) {
          const postings = Object.fromEntries(tokens.map(token => [token, collection.tokens.get(token)]));
          if (Buffer.byteLength(JSON.stringify(postings)) > MAX_SHARD_BYTES && tokens.length > 1) {
            const children = new Map();
            for (const token of tokens) {
              const child = token.slice(0, prefix.length + 1);
              if (!children.has(child)) children.set(child, []);
              children.get(child).push(token);
            }
            if (children.size > 1) {
              for (const [child, childTokens] of children) {
                if (child === prefix) {
                  shards[`${prefix}$`] = writeArtifact(`${category}/${prefix}-exact`, {
                    [childTokens[0]]: collection.tokens.get(childTokens[0]),
                  });
                  shardCount++;
                } else writeShard(child, childTokens);
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
        prefixes[rootPrefix] = writeArtifact(`${category}/lookup-${rootPrefix}`, shards);
      }
      const metadata = [];
      for (let offset = 0; offset < collection.documents.length; offset += DOCUMENT_GROUP_SIZE) {
        metadata.push(writeArtifact(`${category}/documents-${offset / DOCUMENT_GROUP_SIZE}`, collection.documents.slice(offset, offset + DOCUMENT_GROUP_SIZE)));
      }
      manifest.collections[category] = {
        count: collection.documents.length,
        metadata,
        parts: collection.parts,
        prefixes,
      };
      console.log(`[web/${category}] ${collection.documents.length} documents in ${shardCount} query shards.`);
    }
    writeFile(MANIFEST, `${JSON.stringify(manifest)}\n`);
    if (!check) {
      // Remove only obsolete JSON in this generator's dedicated output directory.
      for (const filename of fs.readdirSync(OUTPUT, { recursive: true })) {
        if (filename.endsWith('.json') && !expectedFiles.has(filename)) fs.unlinkSync(path.join(OUTPUT, filename));
      }
    }
  }

  return { addDocument, write };
}

module.exports = { createWebSearchBuilder };
