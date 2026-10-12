import { lazy, type ComponentType } from 'react';
import { matchPath } from 'react-router-dom';

function page(path: string, load: () => Promise<{ default: ComponentType }>) {
  const route = {
    path,
    Component: lazy(load) as ComponentType,
    async preload() {
      route.Component = (await load()).default;
    },
  };
  return route;
}

const far = () => import('./pages/FARPage').then(({ FARPage }) => ({ default: FARPage }));
const aim = () => import('./pages/AIMPage').then(({ AIMPage }) => ({ default: AIMPage }));

export const appRoutes = [
  page('/', () => import('./pages/HomePage').then(({ HomePage }) => ({ default: HomePage }))),
  page('/far', far),
  page('/far/:partId', far),
  page('/aim', aim),
  page('/aim/:chapterId', aim),
  page('/glossary', () => import('./pages/GlossaryPage').then(({ GlossaryPage }) => ({ default: GlossaryPage }))),
  page('/study', () => import('./pages/StudyPage').then(({ StudyPage }) => ({ default: StudyPage }))),
  page('/quizzes', () => import('./pages/QuizzesPage').then(({ QuizzesPage }) => ({ default: QuizzesPage }))),
  page('/quizzes/:quizId', () => import('./pages/QuizPage').then(({ QuizPage }) => ({ default: QuizPage }))),
  page('/flashcards', () => import('./pages/FlashcardsPage').then(({ FlashcardsPage }) => ({ default: FlashcardsPage }))),
  page('/flashcards/:deckId', () => import('./pages/FlashcardDeckPage').then(({ FlashcardDeckPage }) => ({ default: FlashcardDeckPage }))),
  page('/search', () => import('./pages/SearchPage').then(({ SearchPage }) => ({ default: SearchPage }))),
  page('/advisory-circulars', () => import('./pages/AdvisoryCircularsPage').then(({ AdvisoryCircularsPage }) => ({ default: AdvisoryCircularsPage }))),
  page('/advisory-circulars/:acId', () => import('./pages/AdvisoryCircularPage').then(({ AdvisoryCircularPage }) => ({ default: AdvisoryCircularPage }))),
  page('/updates', () => import('./pages/UpdatesPage').then(({ UpdatesPage }) => ({ default: UpdatesPage }))),
  page('/privacy', () => import('./pages/PrivacyPage').then(({ PrivacyPage }) => ({ default: PrivacyPage }))),
  page('/terms', () => import('./pages/TermsPage').then(({ TermsPage }) => ({ default: TermsPage }))),
  page('/support', () => import('./pages/SupportPage').then(({ SupportPage }) => ({ default: SupportPage }))),
];

export async function preloadRoute(pathname: string) {
  await appRoutes.find(({ path }) => matchPath(path, pathname))?.preload();
}
