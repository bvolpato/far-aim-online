import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, type KeyboardEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ChevronLeft, RotateCcw, Shuffle, Check, X, CheckCircle2 } from 'lucide-react';
import { getFlashcardDeckMetadata } from '../data/catalog';
import { getFlashcardDeck } from '../data/study';
import type { Flashcard, FlashcardDeck } from '../data';
import { useRouteData } from '../context/route-data';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';

import { Progress } from '../components/ui/progress';

export function FlashcardDeckPage() {
  const { deckId } = useParams();
  const deckMeta = deckId ? getFlashcardDeckMetadata(deckId) : undefined;
  const routeData = useRouteData();
  const initialDeck = routeData.flashcardDeck?.id === deckId ? routeData.flashcardDeck : undefined;
  const [deck, setDeck] = useState<FlashcardDeck | undefined>(initialDeck);
  const [isLoading, setIsLoading] = useState(!initialDeck);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [cards, setCards] = useState<Flashcard[]>(() => initialDeck ? [...initialDeck.cards] : []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [unknownCards, setUnknownCards] = useState<Set<string>>(new Set());
  const [isReviewMode, setIsReviewMode] = useState(false);

  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setUnknownCards(new Set());
    setIsReviewMode(false);
    setLoadError(false);

    if (!deckId || !deckMeta) {
      setDeck(undefined);
      setCards([]);
      setIsLoading(false);
      return;
    }

    if (initialDeck) {
      setDeck(initialDeck);
      setCards([...initialDeck.cards]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setDeck(undefined);
    setCards([]);
    setIsLoading(true);
    getFlashcardDeck(deckId).then((loadedDeck) => {
      if (cancelled) return;
      if (!loadedDeck) {
        setLoadError(true);
        return;
      }
      setDeck(loadedDeck);
      setCards([...loadedDeck.cards]);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deckId, deckMeta, initialDeck, loadAttempt]);

  if (!deckMeta) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Deck not found</h1>
        <Button variant="link" asChild>
          <Link to="/flashcards">Return to flashcards</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || (deck && deck.id !== deckId)) {
    return (
      <div role="status" className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        Loading {deckMeta.title}…
      </div>
    );
  }

  if (loadError || !deck) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-3">This deck couldn’t be loaded</h1>
        <p role="alert" className="text-muted-foreground mb-5">Check your connection and try again.</p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="mr-3">Try again</Button>
        <Button variant="link" asChild>
          <Link to="/flashcards">Return to flashcards</Link>
        </Button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const completedCount = knownCards.size + unknownCards.size;
  const isComplete = cards.length > 0 && completedCount === cards.length;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  };

  const handleShuffle = () => {
    const shuffled = [...deck.cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setUnknownCards(new Set());
    setIsReviewMode(false);
  };

  const handleReset = () => {
    setCards([...deck.cards]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setUnknownCards(new Set());
    setIsReviewMode(false);
  };

  const moveToNextPendingCard = (nextKnown: Set<string>, nextUnknown: Set<string>) => {
    const nextIndex = cards.findIndex(
      (card, index) => index > currentIndex && !nextKnown.has(card.id) && !nextUnknown.has(card.id)
    );
    const firstPendingIndex = nextIndex >= 0
      ? nextIndex
      : cards.findIndex((card) => !nextKnown.has(card.id) && !nextUnknown.has(card.id));

    if (firstPendingIndex >= 0) {
      setCurrentIndex(firstPendingIndex);
      setIsFlipped(false);
    }
  };

  const markCurrentCard = (known: boolean) => {
    if (!currentCard) return;
    const newKnown = new Set(knownCards);
    const newUnknown = new Set(unknownCards);

    if (known) {
      newKnown.add(currentCard.id);
      newUnknown.delete(currentCard.id);
    } else {
      newUnknown.add(currentCard.id);
      newKnown.delete(currentCard.id);
    }

    setKnownCards(newKnown);
    setUnknownCards(newUnknown);
    moveToNextPendingCard(newKnown, newUnknown);
  };

  const handleMarkKnown = () => markCurrentCard(true);

  const handleMarkUnknown = () => {
    markCurrentCard(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
        handleNext();
        break;
      case 'ArrowLeft':
        handlePrevious();
        break;
      case 'k':
        handleMarkKnown();
        break;
      case 'u':
        handleMarkUnknown();
        break;
    }
  };

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleFlip();
    }
  };

  const handleReviewMissed = () => {
    const missedCards = deck.cards.filter((card) => unknownCards.has(card.id));
    setCards(missedCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setUnknownCards(new Set());
    setIsReviewMode(true);
  };

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-8 animate-fade-in"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <Helmet>
        <title>{`${deck.title} | FAR/AIM Online`}</title>
        <meta name="description" content={deck.description} />
      </Helmet>

      {/* Breadcrumb */}
      <Breadcrumbs items={[
        { label: 'Flashcards', path: '/flashcards' },
        { label: deck.title },
      ]} />

      <h1 className="mt-4 text-2xl font-bold text-foreground">{deck.title}</h1>

      {/* Progress */}
      <div className="mb-6 mt-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">
            {isComplete ? `${completedCount} cards completed` : `Card ${currentIndex + 1} of ${cards.length}`}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="w-4 h-4" />
              {knownCards.size}
            </span>
            <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
              <X className="w-4 h-4" />
              {unknownCards.size}
            </span>
          </div>
        </div>
        <Progress
          value={completedCount}
          max={cards.length}
          indicatorClassName="bg-amber-500"
        />
      </div>

      {isComplete ? (
        <section
          className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-8 text-center shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            {isReviewMode ? 'Review complete' : 'Deck complete'}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">
            {isReviewMode ? 'Missed cards reviewed' : 'Nice work'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {isReviewMode
              ? `You reviewed all ${cards.length} missed card${cards.length === 1 ? '' : 's'}.`
              : `You completed all ${cards.length} cards in this deck.`}
          </p>
          <div className="mt-6 flex justify-center gap-6 text-sm">
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" aria-hidden="true" />
              {knownCards.size} Got it
            </span>
            <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
              <X className="h-4 w-4" aria-hidden="true" />
              {unknownCards.size} Still learning
            </span>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {!isReviewMode && unknownCards.size > 0 && (
              <Button type="button" variant="outline" onClick={handleReviewMissed}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Review {unknownCards.size} missed card{unknownCards.size === 1 ? '' : 's'}
              </Button>
            )}
            <Button type="button" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Restart deck
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/* Flashcard */}
          {currentCard && (
            <div
              className="flashcard mb-6 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={handleFlip}
              onKeyDown={handleCardKeyDown}
              role="button"
              tabIndex={0}
              aria-pressed={isFlipped}
              aria-label={`Show ${isFlipped ? 'term' : 'definition'} for ${currentCard.front}`}
              style={{ minHeight: '320px' }}
            >
              <div className={`flashcard-inner ${isFlipped ? 'flipped' : ''}`} style={{ minHeight: '320px' }}>
                {/* Front */}
                <div className="flashcard-front flex flex-col items-center justify-center rounded-lg border bg-card p-8 text-card-foreground shadow-lg">
                  <span className="mb-4 text-xs uppercase tracking-wide text-muted-foreground">
                    Term
                  </span>
                  <h2 className="text-center text-2xl font-bold text-foreground">
                    {currentCard.front}
                  </h2>
                </div>

                {/* Back */}
                <div className="flashcard-back flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-8 dark:border-amber-800 dark:from-amber-900/30 dark:to-orange-900/30">
                  <span className="mb-4 text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Definition
                  </span>
                  <p className="text-center text-lg leading-relaxed text-foreground">
                    {currentCard.back}
                  </p>
                  <span className="mt-6 text-xs text-amber-600/70 dark:text-amber-400/70">
                    {currentCard.reference}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="space-y-4">
            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="mr-2 h-5 w-5" aria-hidden="true" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleShuffle}
                  title="Shuffle cards"
                  aria-label="Shuffle cards and restart"
                >
                  <Shuffle className="h-5 w-5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleReset}
                  title="Restart deck"
                  aria-label="Restart deck"
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={handleNext}
                disabled={currentIndex === cards.length - 1}
              >
                Next
                <ChevronRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            {/* Know/Don't Know buttons */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleMarkUnknown}
                className="flex-1 rounded-xl border-2 border-red-200 bg-red-50 py-6 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
              >
                <X className="mr-2 h-5 w-5" aria-hidden="true" />
                Still Learning
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleMarkKnown}
                className="flex-1 rounded-xl border-2 border-emerald-200 bg-emerald-50 py-6 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
              >
                <Check className="mr-2 h-5 w-5" aria-hidden="true" />
                Got It!
              </Button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
