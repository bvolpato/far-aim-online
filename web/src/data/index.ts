// Data loading barrel - prefer domain modules (./far, ./aim, ./pcg, ./ac, ./sourceStatus, ./catalog) in page routes.

export { getFARPart } from './far';
export { getAIMChapter } from './aim';
export { getPCGTerms } from './pcg';
export { getAdvisoryCirculars, getAdvisoryCircularContent } from './ac';
export { getFlashcardDeck, getQuiz } from './study';
export { getSourceStatus } from './sourceStatus';

export {
  aimIndex,
  flashcardDecks,
  farIndex,
  farPilotIndex,
  getAIMChaptersList,
  getAllAIMChapters,
  getAllFARParts,
  getAllFlashcardDecks,
  getAllQuizzes,
  getFARPartMeta,
  getFlashcardDeckMetadata,
  getFlashcardDecksByCategory,
  getFlashcardsForAIMChapter,
  getFlashcardsForFARPart,
  getFARPartsList,
  getPilotFARPartNumbers,
  getPilotFARParts,
  getPilotFARPartsList,
  getQuizForAIMChapter,
  getQuizForFARPart,
  getQuizMetadata,
  getQuizzesByCategory,
  getStudyPaths,
  quizzes,
} from './catalog';

export type {
  AIMChapter,
  AIMChapterMeta,
  AIMSection,
  AIMSubsection,
  AdvisoryCircular,
  AdvisoryCircularContent,
  AdvisoryCircularPage,
  EmbeddedFlashcard,
  EmbeddedQuizQuestion,
  FARAppendix,
  FARPart,
  FARPartMeta,
  FARSection,
  FARSubpart,
  Flashcard,
  FlashcardDeck,
  FlashcardDeckMeta,
  PCGTerm,
  Quiz,
  QuizMeta,
  QuizQuestion,
  ReferenceFigure,
  SourceChangeWatch,
  SourceReleaseNote,
  SourceStatus,
  SourceStatusItem,
  StudyPath,
  StudyPathReference,
} from './types';
