import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, FileText, BookOpen, Layers, X, Star, Filter as FilterIcon, Book, Loader2, ClipboardList, ArrowRight } from 'lucide-react';
import { getPilotFARPartNumbers } from '../data/catalog';
import { searchContent, type SearchResult } from '../data/search';
import { resolveDirectJump } from '../lib/directJump';
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

const DEFAULT_FILTERS: SearchFilters = {
  farPilot: true,
  farFull: false,
  aim: true,
  pcg: true,
  ac: true,
  flashcards: true,
};

function parseFiltersFromParams(params: URLSearchParams): SearchFilters {
  const scope = params.get('scope');
  if (!scope) return DEFAULT_FILTERS;
  const active = new Set(scope.split(',').filter(Boolean));
  const farFull = active.has('farFull');
  return {
    farPilot: !farFull && active.has('farPilot'),
    farFull,
    aim: active.has('aim'),
    pcg: active.has('pcg'),
    ac: active.has('ac'),
    flashcards: active.has('flashcards'),
  };
}

function serializeFiltersToParam(filters: SearchFilters): string | null {
  const isDefault =
    filters.farPilot === DEFAULT_FILTERS.farPilot &&
    filters.farFull === DEFAULT_FILTERS.farFull &&
    filters.aim === DEFAULT_FILTERS.aim &&
    filters.pcg === DEFAULT_FILTERS.pcg &&
    filters.ac === DEFAULT_FILTERS.ac &&
    filters.flashcards === DEFAULT_FILTERS.flashcards;
  if (isDefault) return null;
  const keys = (Object.keys(filters) as (keyof SearchFilters)[]).filter((key) => filters[key]);
  return keys.length > 0 ? keys.join(',') : 'none';
}

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
  const pilotPartNumbers = useMemo(() => getPilotFARPartNumbers(), []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [isSearchInteractive, setIsSearchInteractive] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const queryRef = useRef(initialQuery);
  const [rawResults, setRawResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(10);
  const [availableCount, setAvailableCount] = useState(0);
  const lastSearchKey = useRef('');
  const [filters, setFilters] = useState<SearchFilters>(() => parseFiltersFromParams(searchParams));

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    setIsSearchInteractive(true);
  }, []);

  useEffect(() => {
    if (isSearchInteractive) searchInputRef.current?.focus();
  }, [isSearchInteractive]);

  // Sync URL changes from browser navigation (back/forward or header links) into local state.
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== queryRef.current) {
      queryRef.current = urlQ;
      setInputValue(urlQ);
      setQuery(urlQ);
    }
    if (searchParams.has('scope') || searchParams.has('q')) {
      const nextFilters = parseFiltersFromParams(searchParams);
      setFilters((prev) =>
        prev.farPilot === nextFilters.farPilot &&
        prev.farFull === nextFilters.farFull &&
        prev.aim === nextFilters.aim &&
        prev.pcg === nextFilters.pcg &&
        prev.ac === nextFilters.ac &&
        prev.flashcards === nextFilters.flashcards
          ? prev
          : nextFilters,
      );
    }
  }, [searchParams]);

  const updateUrl = (nextQuery: string, nextFilters: SearchFilters) => {
    const nextParams: Record<string, string> = {};
    if (nextQuery) {
      nextParams.q = nextQuery;
      const scopeParam = serializeFiltersToParam(nextFilters);
      if (scopeParam) nextParams.scope = scopeParam;
    }
    setSearchParams(nextParams, { replace: true });
  };

  // Debounce: input -> query (+ update URL)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== queryRef.current) {
        queryRef.current = inputValue;
        setQuery(inputValue);
        const nextParams: Record<string, string> = {};
        if (inputValue) {
          nextParams.q = inputValue;
          const scopeParam = serializeFiltersToParam(filters);
          if (scopeParam) nextParams.scope = scopeParam;
        }
        setSearchParams(nextParams, { replace: true });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [inputValue, filters, setSearchParams]);

  const activeCategoryCount = useMemo(
    () =>
      Number(filters.farPilot || filters.farFull) +
      Number(filters.aim) +
      Number(filters.pcg) +
      Number(filters.ac) +
      Number(filters.flashcards),
    [filters],
  );

  // Perform search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRawResults([]);
      setIsSearching(false);
      setSearchError(null);
      setAvailableCount(0);
      return;
    }

    const categories: string[] = [];
    if (filters.farPilot || filters.farFull) categories.push('far');
    if (filters.aim) categories.push('aim');
    if (filters.pcg) categories.push('pcg');
    if (filters.ac) categories.push('ac');
    if (filters.flashcards) categories.push('flashcards');

    if (categories.length === 0) {
      setRawResults([]);
      setIsSearching(false);
      setSearchError(null);
      setAvailableCount(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const searchKey = JSON.stringify([trimmed, filters]);
    let effectiveLimit = visibleCount;
    if (lastSearchKey.current !== searchKey) {
      lastSearchKey.current = searchKey;
      setRawResults([]);
      setAvailableCount(0);
      if (visibleCount !== 10) {
        effectiveLimit = 10;
        setVisibleCount(10);
      }
    }
    setIsSearching(true);
    setSearchError(null);

    const farScope = filters.farPilot && !filters.farFull ? pilotPartNumbers : undefined;
    void searchContent(trimmed, categories, farScope, {
      signal: controller.signal,
      resultLimit: effectiveLimit,
      snippetLimit: effectiveLimit,
      onProgress: (results, total) => {
        if (cancelled) return;
        setAvailableCount(total);
        setRawResults(previous => {
          const prevContent = new Map<string, string>();
          for (const item of previous) {
            if (item.content) prevContent.set(`${item.link}\0${item.title}`, item.content);
          }
          return results.map(result => ({
            ...result,
            content: result.content || prevContent.get(`${result.link}\0${result.title}`) || '',
          }));
        });
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
  }, [query, filters, retryCount, visibleCount, pilotPartNumbers]);

  // Search History
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    const readHistory = () => {
      try {
        const saved = localStorage.getItem('search_history');
        const parsed = saved ? JSON.parse(saved) : [];
        setHistory(Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : []);
      } catch {
        setHistory([]);
      }
    };
    readHistory();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'search_history') readHistory();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persistHistory = (nextHistory: string[]) => {
    try {
      if (nextHistory.length === 0) {
        localStorage.removeItem('search_history');
      } else {
        localStorage.setItem('search_history', JSON.stringify(nextHistory));
      }
    } catch {
      // Ignore unavailable storage (private browsing / quota exceeded)
    }
  };

  const addToHistory = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    setHistory(prev => {
      const newHistory = [trimmed, ...prev.filter(h => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, 10);
      persistHistory(newHistory);
      return newHistory;
    });
  };

  const removeFromHistory = (term: string) => {
    setHistory(prev => {
      const next = prev.filter(item => item !== term);
      persistHistory(next);
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    persistHistory([]);
  };

  const directJump = useMemo(() => resolveDirectJump(query), [query]);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return rawResults.filter(result => {
      if (result.type === 'aim') return filters.aim;
      if (result.type === 'pcg') return filters.pcg;
      if (result.type === 'ac') return filters.ac;
      if (result.type === 'flashcard') return filters.flashcards;
      if (result.type === 'far') return filters.farPilot || filters.farFull;
      return true;
    });
  }, [query, filters, rawResults]);

  const handleSearch = (term: string) => {
    queryRef.current = term;
    setInputValue(term);
    setQuery(term);
    if (term.trim().length >= 2) addToHistory(term);
    updateUrl(term, filters);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSearch(inputValue);
  };

  const toggleFilter = (key: keyof SearchFilters) => {
    setFilters(prev => {
      const next: SearchFilters =
        key === 'farPilot'
          ? { ...prev, farPilot: !prev.farPilot, farFull: false }
          : key === 'farFull'
            ? { ...prev, farFull: !prev.farFull, farPilot: false }
            : { ...prev, [key]: !prev[key] };
      updateUrl(queryRef.current, next);
      return next;
    });
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

  const trimmedQuery = query.trim();

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
      <form onSubmit={handleFormSubmit} role="search" aria-label="Reference search" className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchInputRef}
          type="search"
          name="q"
          value={inputValue}
          disabled={!isSearchInteractive}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search regulations (91.205, 4-3-2, Class B, AC 61-65)..."
          aria-label="Search FAR/AIM content"
          className="pl-12 pr-12 py-4 h-auto rounded-xl"
        />
        {inputValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </form>

      {/* Search Filters */}
      <div className="mb-8 flex flex-wrap items-center gap-2" role="group" aria-label="Search content types">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <FilterIcon className="w-4 h-4" />
          Search in:
        </span>
        {filterButtons.map(({ key, label, icon, activeColor }) => (
          <Button
            key={key}
            type="button"
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

      {/* Direct Jump Card */}
      {directJump && trimmedQuery.length >= 2 && (
        <Link
          to={directJump.to}
          onClick={() => addToHistory(trimmedQuery)}
          className="block mb-5"
        >
          <Card className="rounded-xl border-sky-300 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 hover:shadow-md transition-all">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                  Direct Jump
                </span>
                <p className="font-semibold text-foreground truncate">{directJump.label}</p>
                <p className="text-sm text-muted-foreground truncate">{directJump.subtitle}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 dark:text-sky-300 shrink-0">
                Open
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Results */}
      {trimmedQuery.length >= 2 && (
        <div>
          <p className="text-sm text-muted-foreground mb-4" role="status" aria-live="polite">
            {activeCategoryCount === 0
              ? 'Select at least one content source above to search.'
              : isSearching && results.length === 0
                ? 'Searching...'
                : searchError
                  ? 'Search unavailable'
                  : `${availableCount.toLocaleString('en-US')} result${availableCount !== 1 ? 's' : ''} for "${trimmedQuery}"`
            }
          </p>

          {activeCategoryCount === 0 && (
            <div className="text-center py-10">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  updateUrl(trimmedQuery, DEFAULT_FILTERS);
                }}
              >
                Reset search filters
              </Button>
            </div>
          )}

          {activeCategoryCount > 0 && isSearching && results.length === 0 && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" aria-label="Searching" />
            </div>
          )}
          {searchError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center mb-4" role="alert">
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
          {activeCategoryCount > 0 && !isSearching && !searchError && results.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <Search className="w-12 h-12 text-muted-foreground/40 mx-auto" aria-hidden="true" />
              <p className="text-muted-foreground">No results found. Try different keywords.</p>
              {filters.farPilot && !filters.farFull && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleFilter('farFull')}
                >
                  Search all 213 FAR parts (FAR Full)
                </Button>
              )}
            </div>
          )}
          {results.length > 0 && (
            <div className="space-y-4">
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.link}-${result.title}`}
                  to={withHighlightParam(result.link, trimmedQuery)}
                  onClick={() => addToHistory(trimmedQuery)}
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
                            {highlightMatch(result.title, trimmedQuery)}
                          </h2>
                          <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                            {highlightMatch(result.content, trimmedQuery)}
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
              <Button type="button" variant="outline" disabled={isSearching} onClick={() => setVisibleCount(count => count + 10)}>
                Show more results ({results.length} of {availableCount.toLocaleString('en-US')})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search suggestions when empty */}
      {trimmedQuery.length < 2 && (
        <div className="mt-8 space-y-8">
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Searches</h2>
                <Button type="button" variant="link" size="sm" onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive">
                  Clear History
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((term) => (
                  <div key={term} className="inline-flex items-center rounded-md bg-secondary">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSearch(term)}
                      className="gap-2 rounded-r-none pr-2"
                    >
                      <Search className="w-3 h-3" aria-hidden="true" />
                      {term}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => removeFromHistory(term)}
                      aria-label={`Remove ${term} from search history`}
                      className="h-9 w-7 rounded-l-none text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </Button>
                  </div>
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
                  type="button"
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
