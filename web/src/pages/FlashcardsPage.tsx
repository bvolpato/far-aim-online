import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layers, ChevronRight, BookOpen, Scale } from 'lucide-react';
import { getFlashcardDecksByCategory, type FlashcardDeckMeta } from '../data/catalog';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';

function FlashcardDeckCard({ deck }: { deck: FlashcardDeckMeta }) {
  return (
    <Link to={`/flashcards/${deck.id}`} className="group block min-w-0">
      <Card className="h-full min-w-0 rounded-2xl transition-all hover:shadow-xl card-hover">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Layers className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {deck.chapter && (
                  <Badge variant="aim">Chapter {deck.chapter}</Badge>
                )}
              </div>
              <h2 className="mb-2 break-words text-xl font-semibold text-foreground transition-colors group-hover:text-amber-600 dark:group-hover:text-amber-400">
                {deck.title}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {deck.description}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="w-4 h-4" />
                <span>{deck.cardCount} cards</span>
              </div>
            </div>
            <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-amber-500" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function FlashcardsPage() {
  const { aim, far } = getFlashcardDecksByCategory();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <Helmet>
        <title>Flashcard Decks | FAR/AIM Online</title>
        <meta name="description" content="Learn and memorize key FAR/AIM concepts with interactive flashcard decks covering all chapters." />
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Flashcard Decks
        </h1>
        <p className="text-muted-foreground">
          Learn and memorize key FAR/AIM concepts with interactive flashcards
        </p>
      </div>

      {/* AIM Flashcards Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Aeronautical Information Manual (AIM)
            </h2>
            <p className="text-sm text-muted-foreground">
              {aim.length} flashcard decks covering all AIM chapters
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {aim.map((deck) => (
            <FlashcardDeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      </div>

      {/* FAR Flashcards Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Federal Aviation Regulations (FAR)
            </h2>
            <p className="text-sm text-muted-foreground">
              {far.length} flashcard decks covering key FAR topics
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {far.map((deck) => (
            <FlashcardDeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      </div>

      {/* Study Tips */}
      <Card className="mt-12 min-w-0 rounded-2xl border-amber-200 bg-gradient-to-br from-amber-500/10 to-amber-600/5 dark:border-amber-800/50 dark:from-amber-500/20 dark:to-amber-600/10">
        <CardContent className="p-4 sm:p-8">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Flashcard Study Tips
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              { title: 'Spaced Repetition', text: 'Review cards at increasing intervals. Cards you know well can be reviewed less often, while difficult cards need more frequent review.' },
              { title: 'Active Recall', text: 'Try to recall the answer before flipping the card. This strengthens memory more than simply reading both sides.' },
              { title: 'Short Sessions', text: 'Multiple short study sessions are more effective than one long session. Aim for 15-20 minutes at a time.' },
              { title: 'Understand, Don\'t Memorize', text: 'Focus on understanding the concept behind each card. Understanding helps with retention and application.' },
            ].map((tip) => (
              <div key={tip.title}>
                <h3 className="font-semibold text-foreground mb-2">{tip.title}</h3>
                <p className="text-sm text-muted-foreground">{tip.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
