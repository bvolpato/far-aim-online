import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Book, Search, X } from 'lucide-react';
import { getPCGTerms } from '../data/pcg';
import type { PCGTerm } from '../data/types';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { highlightMatch } from '../lib/highlight';
import { findGlossaryTerm, searchGlossaryTerms } from '../lib/glossary';
import { cn } from '@/lib/utils';

const SEE_PATTERN_SOURCE = '\\((See(?:\\s+also)?)(\\s+ICAO\\s+term)?\\s+((?:[^()]|\\([^()]*\\))+?)\\.?\\)';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function scrollToGlossaryTerm(target: HTMLElement) {
  target.scrollIntoView({ behavior: 'auto', block: 'start' });
  target.classList.add('bg-yellow-100', 'dark:bg-yellow-900/30', 'transition-colors', 'duration-500');
  window.setTimeout(() => {
    target.classList.remove('bg-yellow-100', 'dark:bg-yellow-900/30');
  }, 2000);
}

const GlossaryTermCard = memo(function GlossaryTermCard({
  item,
  allTerms,
  highlightQuery,
  onSelectReference,
}: {
  item: PCGTerm;
  allTerms: PCGTerm[];
  highlightQuery: string;
  onSelectReference: (termRef: string, isIcaoTerm: boolean) => void;
}) {
  const renderedDefinition = useMemo(() => {
    const definition = item.definition;
    const seePattern = new RegExp(SEE_PATTERN_SOURCE, 'gi');
    const result: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = seePattern.exec(definition)) !== null) {
      if (match.index > lastIndex) {
        result.push(
          <span key={`text-${lastIndex}`}>
            {highlightMatch(definition.slice(lastIndex, match.index), highlightQuery)}
          </span>
        );
      }

      const seeType = match[1];
      const isIcaoTerm = Boolean(match[2]);
      const termRef = match[3].trim().replace(/\.$/, '');
      const referencedTerm = findGlossaryTerm(allTerms, termRef, isIcaoTerm);
      const hrefTarget = referencedTerm?.term ?? termRef;

      result.push(
        <span key={`see-${match.index}`}>
          ({seeType}{isIcaoTerm ? ' ICAO term ' : ' '}
          <a
            href={`#${hrefTarget}`}
            onClick={(event) => {
              event.preventDefault();
              onSelectReference(termRef, isIcaoTerm);
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
          >
            {highlightMatch(termRef, highlightQuery)}
          </a>
          .)
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < definition.length) {
      result.push(
        <span key={`text-${lastIndex}`}>
          {highlightMatch(definition.slice(lastIndex), highlightQuery)}
        </span>
      );
    }

    return result.length > 0 ? result : highlightMatch(definition, highlightQuery);
  }, [allTerms, highlightQuery, item.definition, onSelectReference]);

  return (
    <Card
      id={item.term}
      className="cv-card rounded-xl scroll-mt-52 transition-colors duration-500"
    >
      <CardContent className="p-4 sm:p-6">
        <h3 className="text-lg font-bold text-foreground mb-2">
          {highlightMatch(item.term, highlightQuery)}
        </h3>
        <div className="prose dark:prose-invert max-w-none text-muted-foreground">
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{renderedDefinition}</p>
        </div>
      </CardContent>
    </Card>
  );
});

export function GlossaryPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [query, setQuery] = useState(searchParams.get('highlight') || '');
  const deferredQuery = useDeferredValue(query);
  const [allTerms, setAllTerms] = useState<PCGTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingScrollTarget = useRef<string | null>(null);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    let active = true;

    getPCGTerms()
      .then((terms) => {
        if (active) {
          setAllTerms(terms);
        }
      })
      .catch((error) => {
        console.error('Failed to load PCG terms', error);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    try {
      pendingScrollTarget.current = decodeURIComponent(location.hash.slice(1));
    } catch {
      pendingScrollTarget.current = location.hash.slice(1);
    }
  }, [location.hash]);

  const terms = useMemo(() => {
    return searchGlossaryTerms(allTerms, deferredQuery);
  }, [allTerms, deferredQuery]);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    for (const term of terms) {
      const firstChar = term.term.trim().charAt(0).toUpperCase();
      if (firstChar >= 'A' && firstChar <= 'Z') {
        letters.add(firstChar);
      }
    }
    return letters;
  }, [terms]);

  const jumpToLetter = (letter: string) => {
    const targetTerm = terms.find((t) => t.term.trim().toUpperCase().startsWith(letter));
    if (targetTerm) {
      const el = document.getElementById(targetTerm.term);
      if (el) {
        scrollToGlossaryTerm(el);
      }
    }
  };

  useEffect(() => {
    if (!pendingScrollTarget.current) return;

    const target = document.getElementById(pendingScrollTarget.current);
    if (!target) return;

    pendingScrollTarget.current = null;
    scrollToGlossaryTerm(target);
  }, [terms]);

  const handleSelectReference = useCallback((termRef: string, isIcaoTerm: boolean) => {
    const referencedTerm = findGlossaryTerm(allTerms, termRef, isIcaoTerm);

    if (referencedTerm && queryRef.current) {
      pendingScrollTarget.current = referencedTerm.term;
      setQuery('');
      return;
    }

    let element = document.getElementById(termRef);

    if (!element && referencedTerm) {
      element = document.getElementById(referencedTerm.term);
    }

    if (element) {
      scrollToGlossaryTerm(element);
    }
  }, [allTerms]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 animate-fade-in">
      <Helmet>
        <title>Pilot/Controller Glossary | FAR/AIM Online</title>
        <meta name="description" content="Official FAA Pilot/Controller Glossary (PCG). Definitions of aeronautical terms used in the Air Traffic Control system." />
        <link rel="canonical" href="https://faraim.online/glossary" />
      </Helmet>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="shrink-0 p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg text-purple-700 dark:text-purple-300">
            <Book className="w-6 h-6" />
          </div>
          <h1 className="min-w-0 text-2xl font-bold leading-tight text-foreground sm:text-3xl">
            Pilot/Controller Glossary
          </h1>
        </div>
        <p className="text-muted-foreground ml-1">
          Official definitions of terms used in the Air Traffic Control system.
        </p>
      </div>

      {/* Local Search */}
      <div className="sticky top-16 z-30 bg-background/95 pt-3 pb-4 backdrop-blur">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter glossary terms..."
            aria-label="Filter glossary terms"
            className="pl-12 pr-12 py-3 h-auto rounded-xl shadow-sm"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              aria-label="Clear glossary filter"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>{loading ? 'Loading glossary...' : `Showing ${terms.length} term${terms.length !== 1 ? 's' : ''}`}</span>
        </div>

        {/* Alphabet quick jump */}
        {!loading && (
          <nav aria-label="Alphabet quick jump" className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
            {ALPHABET.map((letter) => {
              const hasTerms = availableLetters.has(letter);
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => jumpToLetter(letter)}
                  disabled={!hasTerms}
                  aria-label={`Jump to terms starting with ${letter}`}
                  className={cn(
                    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg font-semibold transition-colors',
                    hasTerms
                      ? 'text-foreground hover:bg-primary/10 hover:text-primary active:bg-primary/20'
                      : 'text-muted-foreground/30 cursor-not-allowed'
                  )}
                >
                  {letter}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Terms List */}
      <div className="space-y-4">
        {terms.length === 0 ? (
          <Card className="rounded-xl">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {loading ? 'Loading glossary terms...' : `No terms found matching "${deferredQuery}"`}
              </p>
            </CardContent>
          </Card>
        ) : (
          terms.map((item, index) => (
            <GlossaryTermCard
              key={`${item.term}-${index}`}
              item={item}
              allTerms={allTerms}
              highlightQuery={deferredQuery}
              onSelectReference={handleSelectReference}
            />
          ))
        )}
      </div>
    </div>
  );
}
