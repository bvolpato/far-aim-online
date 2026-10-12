import { getFlashcardDeckMetadata, getQuizMetadata } from './catalog';
import { fetchJsonAsset } from './jsonAssets';
import type { FlashcardDeck, Quiz } from './index';

type JsonUrl = string;

const quizAssetUrls = import.meta.glob('../../../data/quizzes/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonUrl>;

const flashcardAssetUrls = import.meta.glob('../../../data/flashcards/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonUrl>;

const quizPromises: Record<string, Promise<Quiz> | undefined> = {};
const flashcardPromises: Record<string, Promise<FlashcardDeck> | undefined> = {};

async function loadStudyAsset<T extends { id: string }>(
  loaders: Record<string, JsonUrl>,
  filePath: string,
  expectedId: string,
  label: string,
): Promise<T> {
  const data = await fetchJsonAsset<T>(loaders, filePath);
  if (!data) {
    throw new Error(`${label} asset is missing: ${filePath}`);
  }
  if (data.id !== expectedId) {
    throw new Error(`${label} metadata mismatch: expected ${expectedId}, loaded ${data.id}`);
  }
  return data;
}

export function getQuiz(quizId: string): Promise<Quiz | undefined> {
  if (!getQuizMetadata(quizId)) return Promise.resolve(undefined);
  const cached = quizPromises[quizId];
  if (cached) return cached;

  const filePath = `../../../data/quizzes/${quizId}.json`;
  const promise = loadStudyAsset<Quiz>(quizAssetUrls, filePath, quizId, 'Quiz').catch((error: unknown) => {
    delete quizPromises[quizId];
    throw error;
  });
  quizPromises[quizId] = promise;
  return promise;
}

export function getFlashcardDeck(deckId: string): Promise<FlashcardDeck | undefined> {
  if (!getFlashcardDeckMetadata(deckId)) return Promise.resolve(undefined);
  const cached = flashcardPromises[deckId];
  if (cached) return cached;

  const filePath = `../../../data/flashcards/${deckId}.json`;
  const promise = loadStudyAsset<FlashcardDeck>(
    flashcardAssetUrls,
    filePath,
    deckId,
    'Flashcard deck',
  ).catch((error: unknown) => {
    delete flashcardPromises[deckId];
    throw error;
  });
  flashcardPromises[deckId] = promise;
  return promise;
}
