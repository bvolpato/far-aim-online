const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const PUBLIC_DIR = path.join(__dirname, '../web/public');
const CHECK_ONLY = process.argv.includes('--check');
const WEB_ONLY = process.argv.includes('--web-only');
const { createWebSearchBuilder } = require('./build_web_search');

// Stop words to exclude from index
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'or', 'this', 'which', 'not', 'but', 'can', 'all', 'any'
]);

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeGeneratedJSON(filePath, value) {
  const generated = JSON.stringify(value);
  if (CHECK_ONLY) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (current !== generated) {
      throw new Error(`Stale generated search artifact: ${path.relative(path.join(__dirname, '..'), filePath)}`);
    }
    return;
  }
  fs.writeFileSync(filePath, generated);
}

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function searchableContent(item) {
  const tableText = (item.tables || []).flatMap(table => [
    table.caption || '',
    ...(table.headers || []),
    ...(table.rows || []).flat()
  ]);
  const figureText = (item.figures || []).flatMap(figure => [
    figure.alt || '',
    figure.caption || ''
  ]);
  return [item.content || '', ...tableText, ...figureText]
    .filter(Boolean)
    .join('\n');
}

function formatAIMChapterLabel(chapterNum) {
  return chapterNum === 0 ? 'General Information' : `Chapter ${chapterNum}`;
}

function buildIndex() {
  console.log('Building inverted indexes...');
  const webSearch = !CHECK_ONLY || WEB_ONLY ? createWebSearchBuilder({ check: CHECK_ONLY }) : null;
  
  // Categories
  const categories = ['far', 'aim', 'flashcards', 'pcg', 'ac'];
  const indexes = {};
  const metadatas = {};

  categories.forEach(cat => {
    indexes[cat] = {};
    metadatas[cat] = [];
  });

  // Track doc IDs per category
  const docIds = { far: 0, aim: 0, flashcards: 0, pcg: 0, ac: 0 };

  function addDocument(category, type, title, content, reference, link, indexContent = content) {
    if (!categories.includes(category)) return;

    const id = docIds[category]++;
    webSearch?.addDocument(category, { id, title, content: indexContent || '', reference, link });
    if (WEB_ONLY) return;
    
    // Store metadata with full content (c) for contextual snippet generation at search time
    metadatas[category].push({
      id: id,
      t: title,      // Short keys to save space
      r: reference,
      l: link,
      c: content || '', // Full content for contextual snippets
      y: type
    });

    // Indexing
    const textToIndex = `${title} ${indexContent || ''}`;
    const tokens = new Set(tokenize(textToIndex)); // Unique tokens per doc

    tokens.forEach(token => {
      if (!indexes[category][token]) {
        indexes[category][token] = [];
      }
      indexes[category][token].push(id);
    });
  }

  // 1. Process FAR Parts
  const farDir = path.join(DATA_DIR, 'far');
  if (fs.existsSync(farDir)) {
    const farIndex = loadJSON(path.join(farDir, 'index.json'));
    const parts = farIndex.parts || [];
    parts.forEach(partMeta => {
      const partData = loadJSON(path.join(DATA_DIR, partMeta.file));
      const partNum = partData.part;

      if (partData.sections) {
        partData.sections.forEach(section => {
          const sectionContent = searchableContent(section);
          addDocument(
            'far',
            'far',
            `§${section.section} - ${section.title}`,
            sectionContent,
            partData.cfr,
            `/far/${partNum}#${section.section}`
          );
        });
      }

      if (partData.subparts) {
        partData.subparts.forEach(subpart => {
          if (subpart.sections) {
            subpart.sections.forEach(section => {
              const sectionContent = searchableContent(section);
              addDocument(
                'far',
                'far',
                `§${section.section} - ${section.title}`,
                sectionContent,
                partData.cfr,
                `/far/${partNum}#${section.section}`
              );
            });
          }
        });
      }

      if (partData.appendices) {
        partData.appendices.forEach(appendix => {
          const appendixContent = searchableContent(appendix);
          addDocument(
            'far',
            'far',
            appendix.title,
            appendixContent,
            partData.cfr,
            `/far/${partNum}#${encodeURIComponent(appendix.appendix)}`
          );
        });
      }
    });
  }

  // 2. Process AIM Chapters
  const aimDir = path.join(DATA_DIR, 'aim');
  if (fs.existsSync(aimDir)) {
    const files = fs.readdirSync(aimDir).filter(f => f.startsWith('chapter') && f.endsWith('.json')).sort();
    files.forEach(file => {
      const chapterData = loadJSON(path.join(aimDir, file));
      const chapterNum = chapterData.chapter;

      if (chapterData.sections) {
        chapterData.sections.forEach(section => {
          const sectionContent = searchableContent(section);
          if (sectionContent) {
            addDocument(
              'aim',
              'aim',
              `${section.section} - ${section.title}`,
              sectionContent,
              `AIM ${formatAIMChapterLabel(chapterNum)}`,
              `/aim/${chapterNum}#${section.section}`
            );
          }

          if (section.subsections) {
            section.subsections.forEach(sub => {
              const subsectionContent = searchableContent(sub);
              addDocument(
                'aim',
                'aim',
                `${sub.subsection} - ${sub.title}`,
                subsectionContent,
                `AIM ${formatAIMChapterLabel(chapterNum)}`,
                `/aim/${chapterNum}#${sub.subsection}`
              );
            });
          }
        });
      }
    });
  }

  // 3. Process Flashcards
  const flashcardsDir = path.join(DATA_DIR, 'flashcards');
  if (fs.existsSync(flashcardsDir)) {
    const files = fs.readdirSync(flashcardsDir).filter(f => f.endsWith('.json')).sort();
    files.forEach(file => {
      const deck = loadJSON(path.join(flashcardsDir, file));
      if (deck.cards) {
        deck.cards.forEach(card => {
          addDocument(
            'flashcards',
            'flashcard',
            card.front,
            card.back,
            card.reference || deck.title,
            `/flashcards/${deck.id}`
          );
        });
      }
    });
  }

  // 4. Process Pilot/Controller Glossary (PCG)
  const pcgPath = path.join(aimDir, 'pcg.json');
  if (fs.existsSync(pcgPath)) {
    const pcgData = loadJSON(pcgPath);
    if (pcgData.terms) {
      pcgData.terms.forEach(term => {
        addDocument(
          'pcg',
          'pcg',
          term.term,
          term.definition,
          'Pilot/Controller Glossary',
          `/glossary#${encodeURIComponent(term.term)}`
        );
      });
    }
  }

  // 5. Process FAA Advisory Circular reference pack
  const acPath = path.join(DATA_DIR, 'advisory-circulars', 'index.json');
  if (fs.existsSync(acPath)) {
    const acData = loadJSON(acPath);
    if (acData.items) {
      acData.items.forEach(ac => {
        let extractedText = '';
        if (ac.contentPath) {
          const contentPath = path.join(DATA_DIR, 'advisory-circulars', ac.contentPath);
          if (fs.existsSync(contentPath)) {
            const content = loadJSON(contentPath);
            extractedText = (content.pages || []).map(page => page.text).join(' ');
          }
        }
        addDocument(
          'ac',
          'ac',
          `AC ${ac.number} - ${ac.title}`,
          [
            ac.summary,
            ac.category,
            ac.status,
            ac.office,
            (ac.relatedCfr || []).join(' '),
            (ac.tags || []).join(' '),
          ].filter(Boolean).join(' '),
          'FAA Advisory Circular',
          ac.contentPath ? `/advisory-circulars/${ac.id}` : `/advisory-circulars#${ac.id}`,
          [
            ac.summary,
            ac.category,
            ac.status,
            ac.office,
            (ac.relatedCfr || []).join(' '),
            (ac.tags || []).join(' '),
            extractedText,
          ].filter(Boolean).join(' '),
        );
      });
    }
  }

  // Write output
  categories.forEach(cat => {
    if (WEB_ONLY) return;
    console.log(`[${cat}] Indexed ${metadatas[cat].length} documents.`);
    console.log(`[${cat}] Unique tokens: ${Object.keys(indexes[cat]).length}`);
    
    writeGeneratedJSON(path.join(PUBLIC_DIR, `inverted-index-${cat}.json`), indexes[cat]);
    writeGeneratedJSON(path.join(PUBLIC_DIR, `search-metadata-${cat}.json`), metadatas[cat]);
  });
  webSearch?.write();
  
  console.log(CHECK_ONLY ? 'Search indexes are current.' : 'Indexes built successfully!');
}

buildIndex();
