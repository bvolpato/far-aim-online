import farIndexData from '../../../data/far/index.json';
import farPilotIndexData from '../../../data/far/pilot-index.json';
import studyPathsData from '../../../data/study-paths.json';
import aimIndexData from '../../../data/aim/index.json';
import studyMetadataData from './studyMetadata.generated.json';
import { getSourceStatus } from './sourceStatus';
import type {
  AIMChapterMeta,
  FARPartMeta,
  FlashcardDeckMeta,
  QuizMeta,
  StudyPath,
} from './types';

export type {
  AIMChapterMeta,
  FARPartMeta,
  FlashcardDeckMeta,
  QuizMeta,
  StudyPathReference,
} from './types';

export { getSourceStatus };

export const farIndex = farIndexData;
export const farPilotIndex = farPilotIndexData;
export const aimIndex = aimIndexData;

const quizMetadata = studyMetadataData.quizzes as QuizMeta[];
const flashcardMetadata = studyMetadataData.flashcardDecks as FlashcardDeckMeta[];
const quizMetadataById = new Map(quizMetadata.map((quiz) => [quiz.id, quiz]));
const flashcardMetadataById = new Map(flashcardMetadata.map((deck) => [deck.id, deck]));

const sortedFarParts: FARPartMeta[] = [...((farIndex.parts || []) as FARPartMeta[])]
  .sort((a, b) => a.part - b.part);
const farPartByNumber = new Map(sortedFarParts.map((part) => [part.part, part]));
const pilotPartNumbersSet = new Set(
  sortedFarParts.filter((part) => part.isPilotIndex).map((part) => part.part),
);
const pilotFarParts: FARPartMeta[] = sortedFarParts.filter((part) => part.isPilotIndex);

const sortedAimChapters: AIMChapterMeta[] = [...((aimIndex.chapters || []) as AIMChapterMeta[])]
  .sort((a, b) => a.chapter - b.chapter);

const filteredStudyPaths: StudyPath[] = ((studyPathsData as { paths?: StudyPath[] }).paths || [])
  .filter((path) => path.references.length > 0);

const quizzesByCategory = {
  misc: quizMetadata.filter((quiz) => quiz.category === 'Miscellaneous')
    .sort((a, b) => a.title.localeCompare(b.title)),
  aim: quizMetadata.filter((quiz) => quiz.category === 'AIM')
    .sort((a, b) => (a.chapter || 0) - (b.chapter || 0)),
  far: quizMetadata.filter((quiz) => quiz.category === 'FAR')
    .sort((a, b) => a.title.localeCompare(b.title)),
};

const flashcardDecksByCategory = {
  aim: flashcardMetadata.filter((deck) => deck.category === 'AIM')
    .sort((a, b) => (a.chapter || 0) - (b.chapter || 0)),
  far: flashcardMetadata.filter((deck) => deck.category === 'FAR')
    .sort((a, b) => a.title.localeCompare(b.title)),
};

const quizByAimChapter = new Map<number, QuizMeta>();
const quizByFarPart = new Map<number, QuizMeta>();
for (const quiz of quizMetadata) {
  if (quiz.category === 'AIM' && quiz.chapter !== undefined && !quizByAimChapter.has(quiz.chapter)) {
    quizByAimChapter.set(quiz.chapter, quiz);
  } else if (quiz.category === 'FAR' && quiz.part !== undefined && !quizByFarPart.has(quiz.part)) {
    quizByFarPart.set(quiz.part, quiz);
  }
}

const flashcardByAimChapter = new Map<number, FlashcardDeckMeta>();
const flashcardByFarPart = new Map<number, FlashcardDeckMeta>();
for (const deck of flashcardMetadata) {
  if (deck.category === 'AIM' && deck.chapter !== undefined && !flashcardByAimChapter.has(deck.chapter)) {
    flashcardByAimChapter.set(deck.chapter, deck);
  } else if (deck.category === 'FAR' && deck.part !== undefined && !flashcardByFarPart.has(deck.part)) {
    flashcardByFarPart.set(deck.part, deck);
  }
}

export const quizzes: Record<string, QuizMeta> = Object.fromEntries(
  quizMetadata.map((quiz) => [quiz.id, quiz]),
);
export const flashcardDecks: Record<string, FlashcardDeckMeta> = Object.fromEntries(
  flashcardMetadata.map((deck) => [deck.id, deck]),
);

export function getAllFARParts(): FARPartMeta[] {
  return sortedFarParts;
}

export function getPilotFARParts(): FARPartMeta[] {
  return pilotFarParts;
}

export function getPilotFARPartNumbers(): ReadonlySet<number> {
  return pilotPartNumbersSet;
}

export function getFARPartMeta(partNumber: number): FARPartMeta | undefined {
  return farPartByNumber.get(partNumber);
}

const aimChapterByNumber = new Map<number, AIMChapterMeta>(
  sortedAimChapters.map((chapter) => [chapter.chapter, chapter]),
);

export function getAllAIMChapters(): AIMChapterMeta[] {
  return sortedAimChapters;
}

export function getAIMChapterMeta(chapterNumber: number): AIMChapterMeta | undefined {
  return aimChapterByNumber.get(chapterNumber);
}

export function getAllQuizzes(): QuizMeta[] {
  return quizMetadata;
}

export function getAllFlashcardDecks(): FlashcardDeckMeta[] {
  return flashcardMetadata;
}

export function getStudyPaths(): StudyPath[] {
  return filteredStudyPaths;
}

export function getQuizMetadata(quizId: string): QuizMeta | undefined {
  return quizMetadataById.get(quizId);
}

export function getFlashcardDeckMetadata(deckId: string): FlashcardDeckMeta | undefined {
  return flashcardMetadataById.get(deckId);
}

export function getQuizzesByCategory(): { misc: QuizMeta[]; aim: QuizMeta[]; far: QuizMeta[] } {
  return quizzesByCategory;
}

export function getFlashcardDecksByCategory(): { aim: FlashcardDeckMeta[]; far: FlashcardDeckMeta[] } {
  return flashcardDecksByCategory;
}

export function getQuizForAIMChapter(chapterNumber: number): QuizMeta | undefined {
  return quizByAimChapter.get(chapterNumber);
}

export function getFlashcardsForAIMChapter(chapterNumber: number): FlashcardDeckMeta | undefined {
  return flashcardByAimChapter.get(chapterNumber);
}

export function getQuizForFARPart(partNumber: number): QuizMeta | undefined {
  return quizByFarPart.get(partNumber);
}

export function getFlashcardsForFARPart(partNumber: number): FlashcardDeckMeta | undefined {
  return flashcardByFarPart.get(partNumber);
}

export function getFARPartsList(): { part: number; title: string; sectionCount?: number; isPilotIndex?: boolean }[] {
  return (farIndex.parts || []).map((part: {
    part: number;
    title: string;
    sectionCount?: number;
    isPilotIndex?: boolean;
  }) => ({
    part: part.part,
    title: part.title,
    sectionCount: part.sectionCount,
    isPilotIndex: part.isPilotIndex,
  }));
}

export function getPilotFARPartsList(): { part: number; title: string; sectionCount?: number }[] {
  return (farPilotIndex.parts || []).map((part: { part: number; title: string; sectionCount?: number }) => ({
    part: part.part,
    title: part.title,
    sectionCount: part.sectionCount,
  }));
}

export function getAIMChaptersList(): { chapter: number; title: string; sectionCount?: number; imageCount?: number }[] {
  return (aimIndex.chapters || []).map((chapter: {
    chapter: number;
    title: string;
    sectionCount?: number;
    imageCount?: number;
  }) => ({
    chapter: chapter.chapter,
    title: chapter.title,
    sectionCount: chapter.sectionCount,
    imageCount: chapter.imageCount,
  }));
}
