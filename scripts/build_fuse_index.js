const fs = require('fs');
const path = require('path');
const Fuse = require('../web/node_modules/fuse.js');

const DATA_DIR = path.join(__dirname, '../data');
const PUBLIC_DIR = path.join(__dirname, '../web/public');

// Ensure output directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildSearchIndex() {
  console.log('Building search index...');
  const searchDocs = [];

  // 1. Process FAR Parts
  const farDir = path.join(DATA_DIR, 'far');
  if (fs.existsSync(farDir)) {
    const files = fs.readdirSync(farDir).filter(f => f.startsWith('part') && f.endsWith('.json'));
    files.forEach(file => {
      const partData = loadJSON(path.join(farDir, file));
      const partNum = partData.part;

      // Direct sections
      if (partData.sections) {
        partData.sections.forEach(section => {
          searchDocs.push({
            type: 'far',
            title: `§${section.section} - ${section.title}`,
            content: section.content || '',
            reference: `14 CFR Part ${partNum}`,
            link: `/far/${partNum}#${section.section}`
          });
        });
      }

      // Subparts
      if (partData.subparts) {
        partData.subparts.forEach(subpart => {
          if (subpart.sections) {
            subpart.sections.forEach(section => {
              searchDocs.push({
                type: 'far',
                title: `§${section.section} - ${section.title}`,
                content: section.content || '',
                reference: `14 CFR Part ${partNum}`,
                link: `/far/${partNum}#${section.section}`
              });
            });
          }
        });
      }
    });
  }

  // 2. Process AIM Chapters
  const aimDir = path.join(DATA_DIR, 'aim');
  if (fs.existsSync(aimDir)) {
    const files = fs.readdirSync(aimDir).filter(f => f.startsWith('chapter') && f.endsWith('.json'));
    files.forEach(file => {
      const chapterData = loadJSON(path.join(aimDir, file));
      const chapterNum = chapterData.chapter;

      if (chapterData.sections) {
        chapterData.sections.forEach(section => {
            // Main Section
            if (section.content) {
                searchDocs.push({
                    type: 'aim',
                    title: `${section.section} - ${section.title}`,
                    content: section.content,
                    reference: `AIM Chapter ${chapterNum}`,
                    link: `/aim/${chapterNum}#${section.section}`
                });
            }

            // Subsections
            if (section.subsections) {
                section.subsections.forEach(sub => {
                    searchDocs.push({
                        type: 'aim',
                        title: `${sub.subsection} - ${sub.title}`,
                        content: sub.content || '',
                        reference: `AIM Chapter ${chapterNum}`,
                        link: `/aim/${chapterNum}#${sub.subsection}`
                    });
                });
            }
        });
      }
    });

    // 3. Process PCG
    const pcgPath = path.join(aimDir, 'pcg.json');
    if (fs.existsSync(pcgPath)) {
        const pcgData = loadJSON(pcgPath);
        if (pcgData.terms) {
            pcgData.terms.forEach(term => {
                searchDocs.push({
                    type: 'pcg',
                    title: term.term,
                    content: term.definition,
                    reference: 'Pilot/Controller Glossary',
                    link: `/pcg#${term.term}`
                });
            });
        }
    }
  }

  // 4. Process Flashcards
  const flashcardsDir = path.join(DATA_DIR, 'flashcards');
  if (fs.existsSync(flashcardsDir)) {
      const files = fs.readdirSync(flashcardsDir).filter(f => f.endsWith('.json'));
      files.forEach(file => {
          const deck = loadJSON(path.join(flashcardsDir, file));
          if (deck.cards) {
              deck.cards.forEach(card => {
                  searchDocs.push({
                      type: 'flashcard',
                      title: card.front,
                      content: card.back,
                      reference: card.reference || deck.title,
                      link: `/flashcards/${deck.id}`
                  });
              });
          }
      });
  }

  console.log(`Indexed ${searchDocs.length} documents.`);

  // Create Fuse Index
  const fuseIndex = Fuse.createIndex(
    ['title', 'content', 'reference'],
    searchDocs
  );

  // Write output
  fs.writeFileSync(path.join(PUBLIC_DIR, 'fuse-list.json'), JSON.stringify(searchDocs));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'fuse-index.json'), JSON.stringify(fuseIndex.toJSON()));
  console.log('Search index built successfully!');
}

buildSearchIndex();
