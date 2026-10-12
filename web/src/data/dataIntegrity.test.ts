import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getAllAIMChapters,
  getAllFARParts,
  getAllFlashcardDecks,
  getAllQuizzes,
  getStudyPaths,
} from './catalog';
import type {
  AIMChapter,
  FARPart,
  FlashcardDeck,
  Quiz,
} from './index';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const BAD_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00c2\u00e2\ufffd]/;
const ALLOWED_TITLE_49_PARTS = new Set([172, 175, 830, 1544, 1552]);

function collectStrings(value: unknown, strings: string[] = []): string[] {
  if (typeof value === 'string') {
    strings.push(value);
    return strings;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, strings));
    return strings;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, strings));
  }

  return strings;
}

function readDataJson<T>(...segments: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', ...segments), 'utf8')) as T;
}

describe('shared aviation data', () => {
  it('has unique FAR routing keys and no non-aviation CFR collisions', () => {
    const seen = new Set<number>();
    const indexedFiles = new Set<string>();

    for (const meta of getAllFARParts()) {
      expect(seen.has(meta.part), `Duplicate FAR part ${meta.part}`).toBe(false);
      seen.add(meta.part);
      indexedFiles.add(`part${meta.part}.json`);
    }

    const farDir = path.join(ROOT_DIR, 'data/far');
    for (const file of fs.readdirSync(farDir).filter((name) => /^part\d+\.json$/.test(name))) {
      expect(indexedFiles.has(file), `${file} is not referenced by data/far/index.json`).toBe(true);

      const payload = JSON.parse(fs.readFileSync(path.join(farDir, file), 'utf8')) as FARPart;
      if (payload.cfr.startsWith('49 CFR')) {
        expect(ALLOWED_TITLE_49_PARTS.has(payload.part), `${file} is ${payload.cfr}`).toBe(true);
      } else {
        expect(payload.cfr, file).toMatch(/^14 CFR Part /);
      }
      expect(payload.title, file).not.toMatch(/household goods/i);
    }
  });

  it('has valid quiz and flashcard counts', () => {
    for (const quizMeta of getAllQuizzes()) {
      const quiz = readDataJson<Quiz>('quizzes', `${quizMeta.id}.json`);
      expect('questions' in quizMeta, quizMeta.id).toBe(false);
      expect(quiz.questions, quiz.id).toHaveLength(quizMeta.questionCount);
      expect(quizMeta.questionCount, quiz.id).toBe(quiz.questionCount);
      for (const question of quiz.questions) {
        expect(question.options.length, question.id).toBeGreaterThanOrEqual(2);
        expect(question.correctAnswer, question.id).toBeGreaterThanOrEqual(0);
        expect(question.correctAnswer, question.id).toBeLessThan(question.options.length);
        expect(question.reference.trim(), question.id).not.toBe('');
      }
    }

    for (const deckMeta of getAllFlashcardDecks()) {
      const deck = readDataJson<FlashcardDeck>('flashcards', `${deckMeta.id}.json`);
      expect('cards' in deckMeta, deckMeta.id).toBe(false);
      expect(deck.cards, deck.id).toHaveLength(deckMeta.cardCount);
      expect(deckMeta.cardCount, deck.id).toBe(deck.cardCount);
      for (const card of deck.cards) {
        expect(card.front.trim(), card.id).not.toBe('');
        expect(card.back.trim(), card.id).not.toBe('');
        expect(card.reference.trim(), card.id).not.toBe('');
      }
    }
  });

  it('has valid certificate study path references', () => {
    const farParts = new Set(getAllFARParts().map((part) => part.part));
    const aimChapters = new Set(getAllAIMChapters().map((chapter) => chapter.chapter));
    const quizIds = new Set(getAllQuizzes().map((quiz) => quiz.id));
    const deckIds = new Set(getAllFlashcardDecks().map((deck) => deck.id));
    const pathIds = new Set<string>();

    for (const studyPath of getStudyPaths()) {
      expect(pathIds.has(studyPath.id), studyPath.id).toBe(false);
      pathIds.add(studyPath.id);
      expect(studyPath.references.length, studyPath.id).toBeGreaterThan(0);

      for (const reference of studyPath.references) {
        if (reference.type === 'far') {
          expect(farParts.has(reference.part ?? -1), `${studyPath.id} ${reference.label}`).toBe(true);
        } else {
          expect(aimChapters.has(reference.chapter ?? -1), `${studyPath.id} ${reference.label}`).toBe(true);
        }
      }

      for (const quizId of studyPath.quizIds) {
        expect(quizIds.has(quizId), `${studyPath.id} quiz ${quizId}`).toBe(true);
      }

      for (const deckId of studyPath.flashcardDeckIds) {
        expect(deckIds.has(deckId), `${studyPath.id} deck ${deckId}`).toBe(true);
      }
    }
  });

  it('loads every indexed FAR part with section metadata', async () => {
    for (const meta of getAllFARParts()) {
      const part = readDataJson<FARPart>('far', `part${meta.part}.json`);
      expect(part, `Part ${meta.part}`).toBeDefined();
      expect(part?.title.trim(), `Part ${meta.part}`).not.toBe('');

      const sections = [
        ...(part?.sections ?? []),
        ...(part?.subparts ?? []).flatMap((subpart) => subpart.sections ?? []),
      ];
      expect(sections.length, `Part ${meta.part}`).toBe(meta.sectionCount ?? sections.length);

      for (const section of sections) {
        expect(section.section.trim(), `Part ${meta.part}`).not.toBe('');
        expect(section.title.trim(), section.section).not.toBe('');
        if (!/reserved/i.test(section.title)) {
          const hasChildSections = sections.some((candidate) =>
            candidate.section.startsWith(`${section.section}-`)
            || candidate.section.startsWith(`${section.section}.`),
          );
          expect(
            section.content.trim() !== '' || (section.figures?.length ?? 0) > 0 || hasChildSections,
            section.section,
          ).toBe(true);
        }
      }
    }
  });

  it('loads every AIM chapter and resolves local figure files', async () => {
    for (const meta of getAllAIMChapters()) {
      const chapter = readDataJson<AIMChapter>('aim', `chapter${meta.chapter}.json`);
      expect(chapter, `Chapter ${meta.chapter}`).toBeDefined();
      expect(chapter?.sections.length, `Chapter ${meta.chapter}`).toBe(meta.sectionCount);

      for (const section of chapter?.sections ?? []) {
        expect(section.section.trim(), section.section).not.toBe('');
        expect(section.title.trim(), section.section).not.toBe('');

        for (const figure of section.figures ?? []) {
          const filePath = path.join(ROOT_DIR, 'web/public/aim/images', figure.src);
          expect(fs.existsSync(filePath), figure.src).toBe(true);
        }
      }
    }
  });

  it('has no crawler mojibake or control artifacts in bundled content', async () => {
    const payloads: unknown[] = [
      ...getAllQuizzes().map((quiz) => readDataJson<Quiz>('quizzes', `${quiz.id}.json`)),
      ...getAllFlashcardDecks().map((deck) => readDataJson<FlashcardDeck>('flashcards', `${deck.id}.json`)),
    ];

    for (const meta of getAllFARParts()) {
      payloads.push(readDataJson<FARPart>('far', `part${meta.part}.json`));
    }

    for (const meta of getAllAIMChapters()) {
      payloads.push(readDataJson<AIMChapter>('aim', `chapter${meta.chapter}.json`));
    }

    for (const text of payloads.flatMap((payload) => collectStrings(payload))) {
      expect(text, text.slice(0, 120)).not.toMatch(BAD_TEXT);
    }
  });
});
