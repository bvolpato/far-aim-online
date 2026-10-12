// Data loading utilities for FAR/AIM and study content

import {
  getAllFARParts,
} from './catalog';
import { fetchJsonAsset, type JsonAssetLoader } from './jsonAssets';

export { getFlashcardDeck, getQuiz } from './study';

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
  getFlashcardDeckMetadata,
  getFlashcardDecksByCategory,
  getFlashcardsForAIMChapter,
  getFlashcardsForFARPart,
  getFARPartsList,
  getPilotFARPartsList,
  getQuizForAIMChapter,
  getQuizForFARPart,
  getQuizMetadata,
  getQuizzesByCategory,
  getSourceStatus,
  getStudyPaths,
  quizzes,
} from './catalog';
// Types for FAR
export interface FARPart {
  part: number;
  title: string;
  cfr: string;
  source?: string;
  url?: string;
  subchapter?: string;
  subchapterTitle?: string;
  isPilotIndex?: boolean;
  effectiveDate?: string;
  sections?: FARSection[];
  subparts?: FARSubpart[];
  appendices?: FARAppendix[];
}

export interface FARSection {
  section: string;
  title: string;
  content: string;
  definitions?: { term: string; definition: string }[];
  abbreviations?: { abbr: string; meaning: string }[];
  keyPoints?: string[];
  figures?: ReferenceFigure[];
  quiz?: EmbeddedQuizQuestion;
  flashcard?: EmbeddedFlashcard;
}

export interface EmbeddedQuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface EmbeddedFlashcard {
  front: string;
  back: string;
}

export interface FARSubpart {
  subpart: string;
  title: string;
  sections: FARSection[];
}

export interface FARAppendix {
  appendix: string;
  title: string;
  content: string;
  figures?: ReferenceFigure[];
}

export interface ReferenceFigure {
  src: string;
  alt?: string;
  caption?: string;
  originalUrl?: string;
}

// Types for AIM
export interface AIMChapter {
  chapter: number;
  title: string;
  effectiveDate?: string;
  sections: AIMSection[];
}

export interface AIMSection {
  section: string;
  title: string;
  content?: string;
  subsections?: AIMSubsection[];
  figures?: ReferenceFigure[];
  tables?: { headers: string[]; rows: string[][]; caption?: string }[];
  quiz?: EmbeddedQuizQuestion;
  flashcard?: EmbeddedFlashcard;
}

export interface AIMSubsection {
  subsection: string;
  title: string;
  content: string;
  keyPoints?: string[];
  characteristics?: string[];
}

// Types for Quizzes
export interface QuizMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  chapter?: number;
  part?: number;
  difficulty: string;
  targetCertificate: string;
  questionCount: number;
  passingScore: number;
}

export interface Quiz extends QuizMeta {
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  reference: string;
}

// Types for Flashcards
export interface FlashcardDeckMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  chapter?: number;
  part?: number;
  cardCount: number;
}

export interface FlashcardDeck extends FlashcardDeckMeta {
  cards: Flashcard[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  reference: string;
}

export interface PCGTerm {
  term: string;
  definition: string;
}

export interface StudyPathReference {
  type: 'far' | 'aim';
  label: string;
  title: string;
  part?: number;
  chapter?: number;
}

export interface StudyPath {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  description: string;
  references: StudyPathReference[];
  quizIds: string[];
  flashcardDeckIds: string[];
}

export interface AdvisoryCircular {
  id: string;
  number: string;
  title: string;
  status: string;
  issued: string;
  office: string;
  category: string;
  summary: string;
  relatedCfr: string[];
  documentUrl: string;
  pdfUrl?: string;
  replaces?: string;
  tags: string[];
  contentPath?: string;
  contentStatus?: 'parsed' | 'partial' | 'unavailable' | 'failed';
  contentError?: string;
  pageCount?: number;
  extractedPageCount?: number;
  wordCount?: number;
  contentUpdated?: string;
}

export interface AdvisoryCircularPage {
  page: number;
  text: string;
}

export interface AdvisoryCircularContent {
  version: number;
  id: string;
  number: string;
  title: string;
  status: 'parsed' | 'partial';
  fetched: string;
  documentUrl: string;
  pdfUrl: string;
  sha256: string;
  pageCount: number;
  extractedPageCount?: number;
  wordCount: number;
  pages: AdvisoryCircularPage[];
}

export interface SourceStatusItem {
  id: string;
  label: string;
  shortLabel: string;
  source: string;
  status: string;
  lastUpdated: string;
  coverage: string;
  itemCount?: number;
  sectionCount?: number;
  questionCount?: number;
  cardCount?: number;
  officialUrl: string;
  notes: string[];
}

export interface SourceReleaseNote {
  date: string;
  title: string;
  details: string[];
}

export interface SourceChangeWatch {
  id: string;
  date: string;
  sourceId: string;
  severity: 'new' | 'review' | 'workflow';
  title: string;
  summary: string;
  affectedReferences: string[];
  actions: string[];
  link: string;
}

export interface SourceStatus {
  version: number;
  generatedAt: string;
  appVersion: string;
  sources: SourceStatusItem[];
  changeWatch: SourceChangeWatch[];
  releaseNotes: SourceReleaseNote[];
  limitations: string[];
  nextChecks: string[];
}




// Helper functions - Lazy Loading

const farPartAssetUrls = import.meta.glob('../../../data/far/part*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

const aimChapterAssetUrls = import.meta.glob('../../../data/aim/chapter*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

const pcgAssetUrls = import.meta.glob('../../../data/aim/pcg.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

const advisoryCircularAssetUrls = import.meta.glob('../../../data/advisory-circulars/index.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

const advisoryCircularContentAssetUrls = import.meta.glob(
  '../../../data/advisory-circulars/content/*.json',
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, JsonAssetLoader>;

let pcgTermsPromise: Promise<PCGTerm[]> | undefined;
let advisoryCircularsPromise: Promise<AdvisoryCircular[]> | undefined;

export async function getFARPart(partNumber: number): Promise<FARPart | undefined> {
  const meta = getAllFARParts().find(part => part.part === partNumber);
  if (!meta) {
    return undefined;
  }

  const part = await fetchJsonAsset<FARPart>(farPartAssetUrls, `../../../data/far/part${partNumber}.json`);
  if (!part) {
    return undefined;
  }

  if (part.cfr !== meta.cfr) {
    throw new Error(`FAR Part ${partNumber} metadata mismatch: expected ${meta.cfr}, loaded ${part.cfr}`);
  }
  return part;
}

export async function getAIMChapter(chapterNumber: number): Promise<AIMChapter | undefined> {
  return fetchJsonAsset<AIMChapter>(aimChapterAssetUrls, `../../../data/aim/chapter${chapterNumber}.json`);
}

export async function getPCGTerms(): Promise<PCGTerm[]> {
  if (!pcgTermsPromise) {
    pcgTermsPromise = fetchJsonAsset<{ terms?: PCGTerm[] }>(
      pcgAssetUrls,
      '../../../data/aim/pcg.json',
    ).then((data) => {
      return data?.terms || [];
    });
  }

  return pcgTermsPromise;
}

// Interface for FAR Part metadata from index (exported for use in navigation)
export interface FARPartMeta {
  part: number;
  title: string;
  cfr: string;
  sectionCount?: number;
  isPilotIndex?: boolean;
  subchapter?: string;
  subchapterTitle?: string;
}

// Interface for AIM Chapter metadata from index (exported for use in navigation)
export interface AIMChapterMeta {
  chapter: number;
  title: string;
  sectionCount?: number;
  imageCount?: number;
}

export async function getAdvisoryCirculars(): Promise<AdvisoryCircular[]> {
  if (!advisoryCircularsPromise) {
    advisoryCircularsPromise = fetchJsonAsset<{ items?: AdvisoryCircular[] }>(
      advisoryCircularAssetUrls,
      '../../../data/advisory-circulars/index.json',
    ).then((data) =>
      (data?.items || [])
        .slice()
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    );
  }
  return advisoryCircularsPromise;
}

export async function getAdvisoryCircularContent(
  advisoryCircular: AdvisoryCircular,
): Promise<AdvisoryCircularContent | undefined> {
  if (!advisoryCircular.contentPath) return undefined;

  return fetchJsonAsset<AdvisoryCircularContent>(
    advisoryCircularContentAssetUrls,
    `../../../data/advisory-circulars/${advisoryCircular.contentPath}`,
  );
}
