import farIndexData from '../../../data/far/index.json';
import farPilotIndexData from '../../../data/far/pilot-index.json';
import studyPathsData from '../../../data/study-paths.json';
import sourceStatusData from '../../../data/source-status.json';
import aimIndexData from '../../../data/aim/index.json';
import studyMetadataData from './studyMetadata.generated.json';
import type {
  AIMChapterMeta,
  FARPartMeta,
  FlashcardDeckMeta,
  QuizMeta,
  SourceStatus,
  StudyPath,
} from './index';

export type {
  AIMChapterMeta,
  FARPartMeta,
  FlashcardDeckMeta,
  QuizMeta,
  StudyPathReference,
} from './index';

export const farIndex = farIndexData;
export const farPilotIndex = farPilotIndexData;
export const aimIndex = aimIndexData;

const quizMetadata = studyMetadataData.quizzes as QuizMeta[];
const flashcardMetadata = studyMetadataData.flashcardDecks as FlashcardDeckMeta[];
const quizMetadataById = new Map(quizMetadata.map((quiz) => [quiz.id, quiz]));
const flashcardMetadataById = new Map(flashcardMetadata.map((deck) => [deck.id, deck]));

export const quizzes: Record<string, QuizMeta> = Object.fromEntries(
  quizMetadata.map((quiz) => [quiz.id, quiz]),
);
export const flashcardDecks: Record<string, FlashcardDeckMeta> = Object.fromEntries(
  flashcardMetadata.map((deck) => [deck.id, deck]),
);

export function getAllFARParts(): FARPartMeta[] {
  const parts = (farIndex.parts || []) as FARPartMeta[];
  return [...parts].sort((a, b) => a.part - b.part);
}

export function getAllAIMChapters(): AIMChapterMeta[] {
  const chapters = (aimIndex.chapters || []) as AIMChapterMeta[];
  return [...chapters].sort((a, b) => a.chapter - b.chapter);
}

export function getAllQuizzes(): QuizMeta[] {
  return quizMetadata.slice();
}

export function getAllFlashcardDecks(): FlashcardDeckMeta[] {
  return flashcardMetadata.slice();
}

export function getStudyPaths(): StudyPath[] {
  return ((studyPathsData as { paths?: StudyPath[] }).paths || [])
    .filter((path) => path.references.length > 0);
}

export function getSourceStatus(): SourceStatus {
  return sourceStatusData as SourceStatus;
}

export function getQuizMetadata(quizId: string): QuizMeta | undefined {
  return quizMetadataById.get(quizId);
}

export function getFlashcardDeckMetadata(deckId: string): FlashcardDeckMeta | undefined {
  return flashcardMetadataById.get(deckId);
}

export function getQuizzesByCategory(): { misc: QuizMeta[]; aim: QuizMeta[]; far: QuizMeta[] } {
  const all = getAllQuizzes();
  return {
    misc: all.filter((quiz) => quiz.category === 'Miscellaneous')
      .sort((a, b) => a.title.localeCompare(b.title)),
    aim: all.filter((quiz) => quiz.category === 'AIM')
      .sort((a, b) => (a.chapter || 0) - (b.chapter || 0)),
    far: all.filter((quiz) => quiz.category === 'FAR')
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export function getFlashcardDecksByCategory(): { aim: FlashcardDeckMeta[]; far: FlashcardDeckMeta[] } {
  const all = getAllFlashcardDecks();
  return {
    aim: all.filter((deck) => deck.category === 'AIM')
      .sort((a, b) => (a.chapter || 0) - (b.chapter || 0)),
    far: all.filter((deck) => deck.category === 'FAR')
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export function getQuizForAIMChapter(chapterNumber: number): QuizMeta | undefined {
  return getAllQuizzes().find((quiz) => quiz.category === 'AIM' && quiz.chapter === chapterNumber);
}

export function getFlashcardsForAIMChapter(chapterNumber: number): FlashcardDeckMeta | undefined {
  return getAllFlashcardDecks().find((deck) => deck.category === 'AIM' && deck.chapter === chapterNumber);
}

export function getQuizForFARPart(partNumber: number): QuizMeta | undefined {
  return getAllQuizzes().find((quiz) => quiz.category === 'FAR' && quiz.part === partNumber);
}

export function getFlashcardsForFARPart(partNumber: number): FlashcardDeckMeta | undefined {
  return getAllFlashcardDecks().find((deck) => deck.category === 'FAR' && deck.part === partNumber);
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
