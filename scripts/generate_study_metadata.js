#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'web/src/data/studyMetadata.generated.json');

function readStudyFiles(directory, kind) {
  const files = fs.readdirSync(path.join(ROOT, 'data', directory))
    .filter((name) => name.endsWith('.json'))
    .sort();

  return files.map((file) => {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', directory, file), 'utf8'));
    const items = source[kind === 'quiz' ? 'questions' : 'cards'];
    const countKey = kind === 'quiz' ? 'questionCount' : 'cardCount';

    if (!Array.isArray(items)) {
      throw new Error(`${directory}/${file} must contain an array of ${kind === 'quiz' ? 'questions' : 'cards'}`);
    }
    if (source.id !== path.basename(file, '.json')) {
      throw new Error(`${directory}/${file} has unexpected id ${JSON.stringify(source.id)}`);
    }
    if (source[countKey] !== items.length) {
      throw new Error(`${directory}/${file} declares ${countKey}=${source[countKey]}, but contains ${items.length}`);
    }

    const common = {
      id: source.id,
      title: source.title,
      description: source.description,
      category: source.category,
    };
    const routing = {};
    for (const key of ['chapter', 'part']) {
      if (source[key] !== undefined) routing[key] = source[key];
    }

    if (kind === 'quiz') {
      return {
        ...common,
        ...routing,
        difficulty: source.difficulty,
        targetCertificate: source.targetCertificate,
        questionCount: items.length,
        passingScore: source.passingScore,
      };
    }

    return {
      ...common,
      ...routing,
      cardCount: items.length,
    };
  });
}

function generate() {
  return `${JSON.stringify({
    quizzes: readStudyFiles('quizzes', 'quiz'),
    flashcardDecks: readStudyFiles('flashcards', 'flashcard'),
  }, null, 2)}\n`;
}

const content = generate();
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== content) {
    console.error('Study metadata is stale. Run node scripts/generate_study_metadata.js.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(OUTPUT, content);
}
