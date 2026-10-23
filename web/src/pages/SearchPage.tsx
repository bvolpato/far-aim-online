import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, FileText, BookOpen, Layers, X, Star, Filter as FilterIcon, Book, Loader2, ClipboardList } from 'lucide-react';
import { farIndex } from '../data/catalog';
import { searchContent, type SearchResult } from '../data/search';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { highlightMatch } from '../lib/highlight';

interface SearchFilters {
  farPilot: boolean;
  farFull: boolean;
  aim: boolean;
  pcg: boolean;
  ac: boolean;
  flashcards: boolean;
}

const PILOT_PART_NUMBERS = new Set(
  (farIndex as { parts?: { part: number; isPilotIndex?: boolean }[] }).parts
    ?.filter(part => part.isPilotIndex)
    .map(part => part.part) || [],
);

function withHighlightParam(link: string, query: string) {
  const hashIndex = link.indexOf('#');
  const base = hashIndex >= 0 ? link.slice(0, hashIndex) : link;
  const hash = hashIndex >= 0 ? link.slice(hashIndex) : '';
  const separator = base.includes('?') ? '&' : '?';

  return `${base}${separator}highlight=${encodeURIComponent(query)}${hash}`;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [inputValue, setInputValue] = useState(initialQuery);
  const [isSearchInteractive, setIsSearchInteractive] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [rawResults, setRawResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(10);
  const [availableCount, setAvailableCount] = useState(0);
  const lastSearchKey = useRef('');
  const [filters, setFilters] = useState<SearchFilters>({
    farPilot: true,
    farFull: false,
    aim: true,
    pcg: true,
    ac: true,
    flashcards: true,
  });

  useEffect(() => {
    setIsSearchInteractive(true);
  }, []);

  // Sync URL changes from browser navigation into local state.
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== query) {
      setInputValue(urlQ);
      setQuery(urlQ);
    }
  }, [query, searchParams]);

  // Debounce: input → query (+ update URL)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== query) {
        setQuery(inputValue);
        if (inputValue) {
          setSearchParams({ q: inputValue }, { replace: true });
        } else {
          setSearchParams({}, { replace: true });
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [inputValue, query, setSearchParams]);

  // Perform search
  useEffect(() => {
    if (query.length < 2) {
      setRawResults([]);
      setIsSearching(false);
      setSearchError(null);
      setAvailableCount(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const searchKey = JSON.stringify([query, filters]);
    if (lastSearchKey.current !== searchKey) {
      setRawResults([]);
      setAvailableCount(0);
      lastSearchKey.current = searchKey;
      if (visibleCount !== 10) {
        setVisibleCount(10);
        return;
      }
    }
    setIsSearching(true);
    setSearchError(null);

    const categories: string[] = [];
    if (filters.farPilot || filters.farFull) categories.push('far');
    if (filters.aim) categories.push('aim');
    if (filters.pcg) categories.push('pcg');
    if (filters.ac) categories.push('ac');
    if (filters.flashcards) categories.push('flashcards');

    const farScope = filters.farPilot && !filters.farFull ? PILOT_PART_NUMBERS : undefined;
    void searchContent(query, categories, farScope, {
      signal: controller.signal,
      resultLimit: visibleCount,
      snippetLimit: visibleCount,
      onProgress: (results, total) => {
        if (cancelled) return;
        setAvailableCount(total);
        setRawResults(previous => results.map(result => ({
          ...result,
          content: result.content || previous.find(item => item.link === result.link && item.title === result.title)?.content || '',
        })));
      },
    })
      .then((results) => {
        if (!cancelled) setRawResults(results);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Search error:', error);
          setSearchError('Search is temporarily unavailable for some content. Retry to load the missing results.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, filters, retryCount, visibleCount]);

  // Search History
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('search_history');
      const parsed = saved ? JSON.parse(saved) : [];
      setHistory(Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : []);
    } catch {
      setHistory([]);
    }
  }, []);

  const addToHistory = (term: string) => {
    if (!term || term.length < 2) return;
    setHistory(prev => {
      const newHistory = [term, ...prev.filter(h => h !== term)].slice(0, 10);
      localStorage.setItem('search_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('search_history');
  };

  // Get pilot index part numbers
  const results = useMemo(() => {
    if (query.length < 2) return [];

    return rawResults.filter(result => {
      if (result.type === 'aim') return filters.aim;
      if (result.type === 'pcg') return filters.pcg;
      if (result.type === 'ac') return filters.ac;
      if (result.type === 'flashcard') return filters.flashcards;
      if (result.type === 'far') {
        const partMatch = result.reference.match(/Part\s+(\d+)/i);
        const partNum = partMatch ? parseInt(partMatch[1]) : null;
        if (filters.farFull) return true;
        if (filters.farPilot && partNum) return PILOT_PART_NUMBERS.has(partNum);
        return false;
      }
      return true;
    });
  }, [query, filters, rawResults]);

  const handleSearch = (term: string) => {
    setInputValue(term);
    setQuery(term);
    addToHistory(term);
    if (term) {
      setSearchParams({ q: term }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const toggleFilter = (key: keyof SearchFilters) => {
    if (key === 'farPilot') {
      setFilters(prev => ({ ...prev, farPilot: !prev.farPilot, farFull: false }));
    } else if (key === 'farFull') {
      setFilters(prev => ({ ...prev, farFull: !prev.farFull, farPilot: false }));
    } else {
      setFilters(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'far': return <FileText className="w-5 h-5" />;
      case 'aim': return <BookOpen className="w-5 h-5" />;
      case 'pcg': return <Book className="w-5 h-5" />;
      case 'flashcard': return <Layers className="w-5 h-5" />;
      case 'ac': return <ClipboardList className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: SearchResult['type']) => {
    switch (type) {
      case 'far': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      case 'aim': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
      case 'pcg': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
      case 'flashcard': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
      case 'ac': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300';
    }
  };

  type FilterKey = keyof SearchFilters;
  const filterButtons: { key: FilterKey; label: string; icon: React.ReactNode; activeColor: string }[] = [
    { key: 'farPilot', label: 'FAR Pilot', icon: <Star className="w-3.5 h-3.5" />, activeColor: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700' },
    { key: 'farFull', label: 'FAR Full', icon: <FileText className="w-3.5 h-3.5" />, activeColor: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700' },
    { key: 'aim', label: 'AIM', icon: <BookOpen className="w-3.5 h-3.5" />, activeColor: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700' },
    { key: 'pcg', label: 'Glossary', icon: <Book className="w-3.5 h-3.5" />, activeColor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700' },
    { key: 'ac', label: 'ACs', icon: <ClipboardList className="w-3.5 h-3.5" />, activeColor: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-300 dark:ring-cyan-700' },
    { key: 'flashcards', label: 'Flashcards', icon: <Layers className="w-3.5 h-3.5" />, activeColor: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700' },
  ];

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <Helmet>
        <title>Search | FAR/AIM Online</title>
        <meta name="description" content="Search across FAR, AIM, Glossary, Advisory Circulars, and study flashcards." />
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Search</h1>
        <p className="text-muted-foreground">Search FAR, AIM, Glossary, Advisory Circulars, and flashcards</p>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={inputValue}
          disabled={!isSearchInteractive}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search for regulations, definitions, topics..."
          aria-label="Search FAR/AIM content"
          className="pl-12 pr-12 py-4 h-auto rounded-xl"
          autoFocus
        />
        {inputValue && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Search Filters */}
      <div className="mb-8 flex flex-wrap items-center gap-2" role="group" aria-label="Search content types">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <FilterIcon className="w-4 h-4" />
          Search in:
        </span>
        {filterButtons.map(({ key, label, icon, activeColor }) => (
          <Button
            key={key}
            variant="ghost"
            size="sm"
            onClick={() => toggleFilter(key)}
            aria-pressed={filters[key]}
            className={`gap-1.5 rounded-lg ${filters[key]
              ? activeColor
              : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
          >
            {icon}
            {label}
          </Button>
        ))}
      </div>

      {/* Results */}
      {query.length >= 2 && (
        <div>
          <p className="text-sm text-muted-foreground mb-4" role="status" aria-live="polite">
            {isSearching && results.length === 0
              ? 'Searching...'
              : searchError
                ? 'Search unavailable'
              : `${availableCount} result${availableCount !== 1 ? 's' : ''} for "${query}"`
            }
          </p>

          {isSearching && results.length === 0 && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" aria-label="Searching" />
            </div>
          )}
          {searchError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center" role="alert">
              <Search className="w-12 h-12 text-destructive/60 mx-auto mb-4" aria-hidden="true" />
              <p className="text-muted-foreground">{searchError}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => setRetryCount((count) => count + 1)}
              >
                Retry search
              </Button>
            </div>
          )}
          {!isSearching && !searchError && results.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">No results found. Try different keywords.</p>
            </div>
          )}
          {results.length > 0 && (
            <div className="space-y-4">
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.link}-${result.title}`}
                  to={withHighlightParam(result.link, query)}
                  onClick={() => addToHistory(query)}
                  className="block"
                >
                  <Card className="rounded-xl hover:shadow-lg transition-all card-hover">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${getTypeColor(result.type)}`}>
                          {getIcon(result.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getTypeColor(result.type)}`}>
                              {result.type.toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">{result.reference}</span>
                          </div>
                          <h2 className="font-semibold text-foreground mb-1">
                            {highlightMatch(result.title, query)}
                          </h2>
                          <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                            {highlightMatch(result.content, query)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
          {results.length < availableCount && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" disabled={isSearching} onClick={() => setVisibleCount(count => count + 10)}>
                Show more results
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search suggestions when empty */}
      {query.length < 2 && (
        <div className="mt-8 space-y-8">
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Searches</h2>
                <Button variant="link" size="sm" onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive">
                  Clear History
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((term, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSearch(term)}
                    className="gap-2"
                  >
                    <Search className="w-3 h-3" />
                    {term}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Popular Topics</h2>
            <div className="flex flex-wrap gap-2">
              {[
                'pilot in command', 'airspace', 'VFR weather minimums', 'flight review',
                'currency', 'night', 'Class B', 'instrument', 'medical certificate', 'cross-country',
              ].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSearch(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
