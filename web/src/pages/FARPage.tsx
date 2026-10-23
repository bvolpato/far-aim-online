import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ChevronLeft, BookOpen, ExternalLink, Filter, Star, Search, Brain, Layers, History, Loader2, FileText, List, Link2, Check } from 'lucide-react';
import { useMemo, useState, useEffect, type CSSProperties } from 'react';
import { getAllFARParts, getFARPart, FARAppendix, FARPart, FARPartMeta, FARSection, farIndex, getAllQuizzes, getAllFlashcardDecks } from '../data';
import type { SearchResult } from '../data/search';
import { HighlightText } from '../components/HighlightText';
import { FormattedContent } from '../components/FormattedContent';
import { useReadingHistory } from '../hooks/useReadingHistory';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { StudyMarkTools } from '../components/StudyMarkTools';
import { ReaderControls } from '../components/ReaderControls';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { ReferenceFigures } from '../components/ReferenceFigures';
import { useRouteData } from '../context/route-data';
import { MobileTableOfContents } from '../components/MobileTableOfContents';

type IndexFilter = 'all' | 'pilot';

function withIndexFilter(path: string, indexFilter: IndexFilter): string {
  if (indexFilter !== 'all') return path;
  const url = new URL(path, 'https://faraim.online');
  url.searchParams.set('index', 'all');
  return `${url.pathname}${url.search}${url.hash}`;
}

function decodeHash(hash: string): string {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Content search result for part listing
interface PartSearchMatch {
  part: FARPartMeta;
  titleMatch: boolean;
  contentMatches: SearchResult[];
}

export function FARPage() {
  const { partId } = useParams();
  const { farPart } = useRouteData();
  const initialPart = farPart?.part.toString() === partId ? farPart : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const indexFilter = (searchParams.get('index') as IndexFilter) || 'pilot';

  const { getLastViewed } = useReadingHistory();
  const lastViewed = getLastViewed('far');

  const [filterQuery, setFilterQuery] = useState('');
  const [isIndexSearchInteractive, setIsIndexSearchInteractive] = useState(false);
  const [contentSearchResults, setContentSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsIndexSearchInteractive(true);
  }, []);

  const allParts = getAllFARParts();
  const [selectedPart, setSelectedPart] = useState<FARPart | null>(initialPart ?? null);
  const [loading, setLoading] = useState(Boolean(partId && !initialPart));
  const [loadError, setLoadError] = useState<'not-found' | 'load-failed' | null>(null);

  // Load selected part data
  useEffect(() => {
    if (initialPart) {
      setSelectedPart(initialPart);
      setLoading(false);
      setLoadError(null);
      return;
    }
    if (!partId) {
      setSelectedPart(null);
      setLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setSelectedPart(null);
    setLoadError(null);

    if (!/^\d+$/.test(partId)) {
      setLoadError('not-found');
      setLoading(false);
      return;
    }

    setLoading(true);
    void getFARPart(Number(partId))
      .then((part) => {
        if (!cancelled) {
          setSelectedPart(part || null);
          setLoadError(part ? null : 'not-found');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load FAR part:', error);
          setSelectedPart(null);
          setLoadError('load-failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [partId, initialPart]);

  useEffect(() => {
    if (filterQuery.length < 3) {
      setContentSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await (await import('../data/search')).searchContent(filterQuery, ['far']);
        if (!cancelled) setContentSearchResults(results);
      } catch (error) {
        if (!cancelled) {
          console.error('Search error:', error);
          setContentSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filterQuery]);

  // Filter parts based on selected index
  const indexFilteredParts = useMemo(() => {
    if (indexFilter === 'pilot') {
      const pilotParts = (farIndex as { parts?: { part: number; isPilotIndex?: boolean }[] }).parts
        ?.filter(p => p.isPilotIndex)
        .map(p => p.part) || [];
      return allParts.filter(p => pilotParts.includes(p.part));
    }
    return allParts;
  }, [allParts, indexFilter]);

  // Compute part matches with priority: title > content
  const partMatches = useMemo((): PartSearchMatch[] => {
    if (!filterQuery) {
      return indexFilteredParts.map(p => ({ part: p, titleMatch: false, contentMatches: [] }));
    }

    const query = filterQuery.toLowerCase();
    const results: PartSearchMatch[] = [];

    for (const part of indexFilteredParts) {
      const titleMatch =
        part.part.toString().includes(query) ||
        part.title?.toLowerCase().includes(query);

      // Filter content search results to this part
      const contentMatches = contentSearchResults.filter(r => {
        // Link format: /far/X?highlight=... or /far/X#section
        const match = r.link.match(/\/far\/(\d+)/);
        return match && parseInt(match[1]) === part.part;
      });

      if (titleMatch || contentMatches.length > 0) {
        results.push({ part, titleMatch, contentMatches });
      }
    }

    // Sort: title matches first, then by content match count, then by part number
    results.sort((a, b) => {
      if (a.titleMatch && !b.titleMatch) return -1;
      if (!a.titleMatch && b.titleMatch) return 1;
      if (a.contentMatches.length !== b.contentMatches.length) {
        return b.contentMatches.length - a.contentMatches.length;
      }
      return a.part.part - b.part.part;
    });

    return results;
  }, [indexFilteredParts, filterQuery, contentSearchResults]);

  const setIndexFilter = (filter: IndexFilter) => {
    setSearchParams({ index: filter });
  };

  // Use the full sequence for deep-linked parts outside the selected pilot index.
  const useAllIndexNavigation = indexFilter === 'all' ||
    Boolean(selectedPart && !indexFilteredParts.some(p => p.part === selectedPart.part));
  const navigationParts = useAllIndexNavigation ? allParts : indexFilteredParts;

  // Find previous and next parts for navigation within the active sequence.
  const navigation = useMemo(() => {
    if (!selectedPart) return { prev: null, next: null };
    const currentIndex = navigationParts.findIndex(p => p.part === selectedPart.part);
    if (currentIndex < 0) return { prev: null, next: null };
    return {
      prev: currentIndex > 0 ? navigationParts[currentIndex - 1] : null,
      next: currentIndex < navigationParts.length - 1 ? navigationParts[currentIndex + 1] : null,
    };
  }, [selectedPart, navigationParts]);

  const navigationQuery = useAllIndexNavigation ? '?index=all' : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (selectedPart) {
    return (
      <FARPartView
        part={selectedPart}
        prevPart={navigation.prev}
        nextPart={navigation.next}
        navigationQuery={navigationQuery}
      />
    );
  }

  if (partId && loadError) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {loadError === 'not-found' ? 'FAR part not found' : 'FAR part unavailable'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {loadError === 'not-found'
            ? `Part ${partId} is not included in this edition.`
            : 'Content could not be loaded. Check connection and try again.'}
        </p>
        <Link className="mt-5 font-medium text-primary hover:underline" to="/far">
          Browse FAR index
        </Link>
      </div>
    );
  }

  const pilotCount = (farIndex as { parts?: { isPilotIndex?: boolean }[] }).parts?.filter(p => p.isPilotIndex).length || 0;
  const totalCount = allParts.length;

  return (
    <>
      <Helmet>
        <title>Federal Aviation Regulations | FAR/AIM Online</title>
        <meta name="description" content="Browse and search Federal Aviation Regulations for pilot study and reference." />
        <link rel="canonical" href="https://faraim.online/far" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Federal Aviation Regulations
        </h1>
        <p className="text-muted-foreground">
          Title 14 of the Code of Federal Regulations (14 CFR)
        </p>
      </div>

      {/* Continue Reading Banner */}
      {lastViewed && (
        <Link
          to={lastViewed.path}
          className="mb-6 flex items-center gap-4 p-4 bg-gradient-to-r from-blue-500/10 to-blue-600/5 dark:from-blue-500/20 dark:to-blue-600/10 rounded-xl border border-blue-200 dark:border-blue-800/50 hover:shadow-md transition-all group"
        >
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <History className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Continue Reading</p>
            <p className="text-foreground font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Part {lastViewed.id}: {lastViewed.title}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-blue-500 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {/* Index Filter Tabs */}
      <div className="mb-6">
        <div className="tab-switcher">
          <button
            onClick={() => setIndexFilter('pilot')}
            aria-pressed={indexFilter === 'pilot'}
            className={`tab-switcher-btn ${indexFilter === 'pilot' ? 'tab-switcher-btn--active' : ''}`}
          >
            <Star className="w-4 h-4" />
            Pilot Index
            <span className="ml-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-semibold">
              {pilotCount}
            </span>
          </button>
          <button
            onClick={() => setIndexFilter('all')}
            aria-pressed={indexFilter === 'all'}
            className={`tab-switcher-btn ${indexFilter === 'all' ? 'tab-switcher-btn--active' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Full Index
            <span className="ml-1 px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
              {totalCount}
            </span>
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {indexFilter === 'pilot'
            ? `Showing ${pilotCount} CFR parts typically found in pilot reference manuals (ASA FAR/AIM)`
            : 'Showing all Title 14 and Title 49 CFR aviation regulations'}
        </p>
      </div>

      {/* Filter Input */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search parts by number, title, or content..."
          value={filterQuery}
          disabled={!isIndexSearchInteractive}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none text-foreground placeholder:text-muted-foreground"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin" />
        )}
      </div>

      {/* Search Results Summary */}
      {filterQuery && filterQuery.length >= 3 && !isSearching && (
        <div className="mb-4 text-sm text-muted-foreground">
          Found {partMatches.length} part{partMatches.length !== 1 ? 's' : ''} matching "{filterQuery}"
          {contentSearchResults.length > 0 && (
            <span> ({contentSearchResults.length} content match{contentSearchResults.length !== 1 ? 'es' : ''})</span>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {partMatches.map(({ part, titleMatch, contentMatches }) => {
          const sectionCount = part.sectionCount || 0;

          // Check if part is in pilot index
          const isPilotPart = (farIndex as { parts?: { part: number; isPilotIndex?: boolean }[] }).parts
            ?.find(p => p.part === part.part)?.isPilotIndex;

          return (
            <div key={part.part} className="space-y-2">
              <Link
                to={withIndexFilter(`/far/${part.part}`, indexFilter)}
                className="group bg-card rounded-xl p-6 shadow-sm hover:shadow-lg transition-all border border-border card-hover block"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm font-semibold rounded-lg">
                        Part {part.part}
                      </span>
                      {isPilotPart && indexFilter === 'all' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs rounded-full">
                          <Star className="w-3 h-3" />
                          Pilot
                        </span>
                      )}
                      {part.subchapter && (
                        <span className="text-xs text-muted-foreground">
                          Subchapter {part.subchapter}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {sectionCount} sections
                      </span>
                      {titleMatch && filterQuery && (
                        <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs rounded-full">
                          Title match
                        </span>
                      )}
                      {contentMatches.length > 0 && (
                        <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs rounded-full flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {contentMatches.length} match{contentMatches.length !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                      <HighlightText text={part.title || `Part ${part.part}`} query={filterQuery} />
                    </h2>
                    {part.subchapterTitle && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {part.subchapterTitle}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </Link>

              {/* Show top content matches for this part */}
              {contentMatches.length > 0 && (
                <div className="ml-4 space-y-2">
                  {contentMatches.slice(0, 3).map((match, idx) => (
                    <Link
                      key={idx}
                      to={withIndexFilter(match.link, indexFilter)}
                      className="block p-3 bg-secondary/50 rounded-lg border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground/70 truncate">
                            {match.reference}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            <HighlightText text={match.content} query={filterQuery} />
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {contentMatches.length > 3 && (
                    <Link
                      to={withIndexFilter(`/far/${part.part}?highlight=${encodeURIComponent(filterQuery)}`, indexFilter)}
                      className="block text-sm text-blue-600 dark:text-blue-400 hover:underline ml-6"
                    >
                      View all {contentMatches.length} matches in Part {part.part}...
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {partMatches.length === 0 && filterQuery && (
          <div className="text-center py-12 text-muted-foreground">
            No parts found matching "{filterQuery}"
          </div>
        )}
      </div>
      </div>
    </>
  );
}

function FARPartView({
  part,
  prevPart,
  nextPart,
  navigationQuery,
}: {
  part: FARPart;
  prevPart: FARPartMeta | null;
  nextPart: FARPartMeta | null;
  navigationQuery: string;
}) {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const highlightTerm = searchParams.get('highlight') || '';
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);
  const location = useLocation();
  const readerControls = useReaderPreferences();

  const { addToHistory } = useReadingHistory();

  const farQuizzes = getAllQuizzes().filter(q => q.category === 'FAR' && q.part === part.part);
  const farFlashcards = getAllFlashcardDecks().filter(d => d.category === 'FAR' && d.part === part.part);

  // Save reading history when part is viewed
  useEffect(() => {
    addToHistory({
      type: 'far',
      id: part.part,
      title: part.title || `Part ${part.part}`,
      path: `/far/${part.part}`,
    });
  }, [part.part, part.title, addToHistory]);

  const allSections = useMemo<FARSection[]>(() => [
    ...(part.sections || []),
    ...(part.subparts?.flatMap(sp => sp.sections || []) || [])
  ], [part.sections, part.subparts]);
  const appendices = useMemo<FARAppendix[]>(() => part.appendices || [], [part.appendices]);

  const [activeSectionId, setActiveSectionId] = useState<string>('');

  const tocItems = useMemo(() => [
    ...allSections.map((s) => ({
      id: s.section,
      label: `§ ${s.section}`,
      title: s.title,
    })),
    ...appendices.map((a) => ({
      id: a.appendix,
      label: a.appendix,
      title: a.title,
      isAppendix: true,
    })),
  ], [allSections, appendices]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const ids = [
      ...allSections.map((s) => s.section),
      ...appendices.map((a) => a.appendix),
    ];
    if (ids.length === 0) return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const sorted = visible.sort(
            (a, b) => Math.abs(a.boundingClientRect.top - 100) - Math.abs(b.boundingClientRect.top - 100)
          );
          setActiveSectionId(sorted[0].target.id);
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.25],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [allSections, appendices]);

  useEffect(() => {
    const targetId = decodeHash(location.hash);
    if (!targetId) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [location.hash, allSections, appendices]);

  // When there's a highlight term (from search), scroll to a match unless the URL
  // already names a section or appendix. The URL anchor takes priority, while the
  // highlight remains available to mark matching text in the rendered content.
  useEffect(() => {
    setHighlightedSectionId(null);
    if (!highlightTerm || allSections.length === 0) return;

    const targetId = decodeHash(location.hash);
    const hasExplicitAnchor = [...allSections, ...appendices].some(item =>
      ('section' in item ? item.section : item.appendix) === targetId
    );
    if (hasExplicitAnchor) return;

    const query = highlightTerm.toLowerCase();

    // Find the first section that contains the highlight term.
    const matchingSection = allSections.find(section => {
      if (section.section.toLowerCase().includes(query)) return true;
      if (section.title?.toLowerCase().includes(query)) return true;
      if (section.content?.toLowerCase().includes(query)) return true;
      if (section.definitions?.some(d =>
        d.term.toLowerCase().includes(query) ||
        d.definition.toLowerCase().includes(query)
      )) return true;
      if (section.abbreviations?.some(a =>
        a.abbr.toLowerCase().includes(query) ||
        a.meaning.toLowerCase().includes(query)
      )) return true;
      if (section.figures?.some(figure =>
        figure.alt?.toLowerCase().includes(query) ||
        figure.caption?.toLowerCase().includes(query)
      )) return true;
      return false;
    });

    if (!matchingSection) return;

    setHighlightedSectionId(matchingSection.section);
    const scrollTimeout = window.setTimeout(() => {
      document.getElementById(matchingSection.section)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    const clearTimeoutId = window.setTimeout(() => {
      setHighlightedSectionId(null);
    }, 3000);

    return () => {
      window.clearTimeout(scrollTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, [highlightTerm, location.hash, allSections, appendices]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>{`${part.cfr} - ${part.title} | FAR/AIM Online`}</title>
        <meta name="description" content={`${part.cfr} - ${part.title}. Read the full regulation text on FAR/AIM Online.`} />
        <link rel="canonical" href={`https://faraim.online/far/${part.part}`} />
      </Helmet>

      {/* Breadcrumb */}
      <Breadcrumbs
        items={[
          { label: 'FAR', path: '/far' },
          { label: `Part ${part.part}` }
        ]}
        className="mb-6"
      />

      {/* Search Bar */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search within this part..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start mt-6">
        {/* Left Sticky Sidebar (Desktop only) */}
        {(allSections.length > 0 || appendices.length > 0) && (
          <aside className="sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto bg-card rounded-2xl p-5 border border-border shadow-sm hidden lg:block">
            <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2 border-b pb-2">
              <List className="w-4 h-4 text-primary" />
              References ({allSections.length + appendices.length})
            </h2>
            <nav className="space-y-1.5">
              {allSections.map((section) => {
                const isActive = activeSectionId === section.section;
                return (
                  <a
                    key={section.section}
                    href={`#${section.section}`}
                    className={`block text-xs px-2.5 py-2 rounded-lg transition-colors truncate ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary'
                        : 'text-muted-foreground hover:text-primary hover:bg-accent/50'
                    }`}
                    title={`§ ${section.section} - ${section.title}`}
                  >
                    <span className="font-semibold text-foreground/80 mr-1">§ {section.section}</span>
                    {section.title}
                  </a>
                );
              })}
              {appendices.length > 0 && (
                <p className="px-2.5 pt-3 text-xs font-semibold uppercase text-muted-foreground">Appendices</p>
              )}
              {appendices.map((appendix) => {
                const isActive = activeSectionId === appendix.appendix;
                return (
                  <a
                    key={appendix.appendix}
                    href={`#${encodeURIComponent(appendix.appendix)}`}
                    className={`block truncate rounded-lg px-2.5 py-2 text-xs transition-colors hover:text-primary ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary'
                        : 'text-muted-foreground hover:bg-accent/50'
                    }`}
                    title={appendix.title}
                  >
                    {appendix.title}
                  </a>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Right Content Area */}
        <div className="min-w-0">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{part.cfr}</p>
                <h1 className="text-2xl font-bold text-foreground">
                  {part.title || `Part ${part.part}`}
                </h1>
              </div>
            </div>
            {part.subchapter && part.subchapterTitle && (
              <p className="text-muted-foreground">
                Subchapter {part.subchapter}: {part.subchapterTitle}
              </p>
            )}
            {part.source && part.url && (
              <a
                href={part.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
              >
                View on {part.source} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Mobile Table of Contents Drawer */}
          {(allSections.length > 0 || appendices.length > 0) && (
            <MobileTableOfContents
              title={`Part ${part.part} Contents`}
              items={tocItems}
              activeId={activeSectionId}
            />
          )}

          {/* Direct Sections (no subparts) */}
          {part.sections && part.sections.length > 0 && (
            <div className="space-y-6">
              {part.sections.map((section) => (
                <SectionView
                  key={section.section}
                  partId={part.part}
                  section={section}
                  searchQuery={searchQuery}
                  highlightTerm={highlightTerm}
                  isHighlighted={highlightedSectionId === section.section}
                  contentStyle={readerControls.contentStyle}
                />
              ))}
            </div>
          )}

          {/* Subparts */}
          {part.subparts && part.subparts.length > 0 && (
            <div className="space-y-8">
              {part.subparts.map((subpart) => (
                <div key={subpart.subpart}>
                  <h2 className="text-xl font-bold text-foreground mb-4 pb-2 border-b border-border">
                    Subpart {subpart.subpart} - {subpart.title}
                  </h2>
                  <div className="space-y-6">
                    {subpart.sections?.map((section) => (
                      <SectionView
                        key={section.section}
                        partId={part.part}
                        section={section}
                        searchQuery={searchQuery}
                        highlightTerm={highlightTerm}
                        isHighlighted={highlightedSectionId === section.section}
                        contentStyle={readerControls.contentStyle}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {part.appendices && part.appendices.length > 0 && (
            <section className="mt-10 space-y-6" aria-labelledby="far-appendices-heading">
              <h2 id="far-appendices-heading" className="text-xl font-bold text-foreground border-b border-border pb-2">
                Appendices
              </h2>
              {part.appendices.map((appendix) => (
                <AppendixView
                  key={appendix.appendix}
                  appendix={appendix}
                  partId={part.part}
                  searchQuery={searchQuery}
                  highlightTerm={highlightTerm}
                  contentStyle={readerControls.contentStyle}
                />
              ))}
            </section>
          )}

          {/* Empty state */}
          {(!part.sections || part.sections.length === 0) &&
            (!part.subparts || part.subparts.length === 0) &&
            (!part.appendices || part.appendices.length === 0) && (
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border">
                <p className="text-muted-foreground text-center">
                  No sections available for this part.
                </p>
              </div>
            )}

          {/* Study Materials Section */}
          {(farQuizzes.length > 0 || farFlashcards.length > 0) && (
            <div className="mt-12 pt-8 border-t border-border">
              <h2 className="text-lg font-bold text-foreground mb-4">
                FAR Study Materials
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {farQuizzes.length > 0 && (
                  <Link
                    to={`/quizzes/${farQuizzes[0].id}`}
                    className="group flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-purple-600/5 dark:from-purple-500/20 dark:to-purple-600/10 rounded-xl border border-purple-200 dark:border-purple-800/50 hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-purple-700 dark:text-purple-300 font-medium">Practice Quiz</p>
                      <p className="text-foreground font-semibold group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {farQuizzes[0].title}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-purple-500 group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}
                {farFlashcards.length > 0 && (
                  <Link
                    to={`/flashcards/${farFlashcards[0].id}`}
                    className="group flex items-center gap-4 p-4 bg-gradient-to-r from-amber-500/10 to-amber-600/5 dark:from-amber-500/20 dark:to-amber-600/10 rounded-xl border border-amber-200 dark:border-amber-800/50 hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Layers className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Flashcards</p>
                      <p className="text-foreground font-semibold group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {farFlashcards[0].title}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Previous/Next Navigation */}
          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
              {prevPart ? (
                <Link
                  to={`/far/${prevPart.part}${navigationQuery}`}
                  className="w-full min-w-0 group flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all sm:flex-1"
                >
                  <ChevronLeft className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="text-left min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Previous</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      Part {prevPart.part}: {prevPart.title || 'Untitled'}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="hidden sm:block sm:flex-1" />
              )}

              {nextPart ? (
                <Link
                  to={`/far/${nextPart.part}${navigationQuery}`}
                  className="w-full min-w-0 group flex items-center justify-end gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all sm:flex-1"
                >
                  <div className="text-right min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      Part {nextPart.part}: {nextPart.title || 'Untitled'}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              ) : (
                <div className="hidden sm:block sm:flex-1" />
              )}
            </div>
          </div>
        </div>
      </div>

      <ReaderControls state={readerControls} />
    </div>
  );
}

function AppendixView({
  appendix,
  partId,
  searchQuery,
  highlightTerm,
  contentStyle,
}: {
  appendix: FARAppendix;
  partId: number;
  searchQuery: string;
  highlightTerm: string;
  contentStyle: CSSProperties;
}) {
  const [copied, setCopied] = useState(false);
  const query = searchQuery.toLowerCase();
  const figureText = (appendix.figures || []).flatMap((figure) => [figure.alt, figure.caption]).join(' ');
  if (query && !`${appendix.appendix} ${appendix.title} ${appendix.content} ${figureText}`.toLowerCase().includes(query)) {
    return null;
  }

  const effectiveQuery = searchQuery || highlightTerm;

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/far/${partId}#${encodeURIComponent(appendix.appendix)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <article id={appendix.appendix} className="bg-card rounded-xl p-6 shadow-sm border border-border scroll-mt-24">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-foreground">
          <HighlightText text={appendix.title} query={effectiveQuery} />
        </h3>
        <button
          type="button"
          onClick={handleCopyLink}
          title="Copy link to this appendix"
          aria-label={`Copy link to ${appendix.title}`}
          className="text-muted-foreground hover:text-primary p-1.5 rounded-lg hover:bg-accent transition-colors flex-shrink-0"
        >
          {copied ? (
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Copied
            </span>
          ) : (
            <Link2 className="w-4 h-4" />
          )}
        </button>
      </div>
      <div className="mb-4">
        <StudyMarkTools
          type="far"
          reference={appendix.appendix}
          title={appendix.title}
          path={`/far/${partId}#${encodeURIComponent(appendix.appendix)}`}
          compact
        />
      </div>
      <FormattedContent
        text={appendix.content}
        className="text-muted-foreground"
        highlight={effectiveQuery}
        tableCaption={appendix.title}
        style={contentStyle}
      />
      {appendix.figures && appendix.figures.length > 0 && (
        <div className="mt-6">
          <ReferenceFigures
            figures={appendix.figures}
            assetRoot="/far/images"
            query={effectiveQuery}
            fallbackLabel={`${appendix.title} figure`}
          />
        </div>
      )}
    </article>
  );
}


function SectionView({
  partId,
  section,
  searchQuery,
  highlightTerm,
  isHighlighted,
  contentStyle
}: {
  partId: number;
  section: FARSection;
  searchQuery: string;
  highlightTerm?: string;
  isHighlighted?: boolean;
  contentStyle: CSSProperties;
}) {
  const figureText = (section.figures || []).flatMap((figure) => [figure.alt, figure.caption]).join(' ');
  // If there's a search query and this section doesn't match, return null
  // We match on section ID, title, content, abbreviations, etc.
  const matchesSearch = useMemo(() => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();

    if (section.section.toLowerCase().includes(query)) return true;
    if (section.title?.toLowerCase().includes(query)) return true;
    if (section.content?.toLowerCase().includes(query)) return true;
    if (figureText.toLowerCase().includes(query)) return true;

    if (section.definitions?.some(d =>
      d.term.toLowerCase().includes(query) ||
      d.definition.toLowerCase().includes(query)
    )) return true;

    if (section.abbreviations?.some(a =>
      a.abbr.toLowerCase().includes(query) ||
      a.meaning.toLowerCase().includes(query)
    )) return true;

    return false;
  }, [figureText, section, searchQuery]);

  // Flash highlight effect when scrolled to via hash or when highlighted from search
  const [isFlashed, setIsFlashed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { hash } = useLocation();

  useEffect(() => {
    if (hash === `#${section.section}`) {
      setIsFlashed(true);
      const timer = setTimeout(() => setIsFlashed(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [hash, section.section]);

  // Also flash when isHighlighted prop is set (from search navigation)
  useEffect(() => {
    if (isHighlighted) {
      setIsFlashed(true);
      const timer = setTimeout(() => setIsFlashed(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  if (!matchesSearch) return null;

  const effectiveQuery = searchQuery || highlightTerm || '';

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/far/${partId}#${section.section}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div
      id={section.section}
      className={`scroll-mt-24 bg-card rounded-xl p-6 shadow-sm border border-border transition-colors duration-500 ${isFlashed ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 flex-wrap">
          <span>§ <HighlightText text={section.section} query={effectiveQuery} /></span>
          <HighlightText text={section.title || ''} query={effectiveQuery} />
        </h3>
        <button
          type="button"
          onClick={handleCopyLink}
          title="Copy link to this section"
          aria-label={`Copy link to section ${section.section}`}
          className="text-muted-foreground hover:text-primary p-1.5 rounded-lg hover:bg-accent transition-colors flex-shrink-0"
        >
          {copied ? (
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Copied
            </span>
          ) : (
            <Link2 className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="mb-4">
        <StudyMarkTools
          type="far"
          reference={`§ ${section.section}`}
          title={section.title || `FAR ${section.section}`}
          path={`/far/${partId}#${section.section}`}
          compact
        />
      </div>

      {section.content && (
        <FormattedContent
          text={section.content}
          className="text-muted-foreground mb-4"
          highlight={effectiveQuery}
          tableCaption={`FAR ${section.section}: ${section.title}`}
          style={contentStyle}
        />
      )}

      {section.figures && section.figures.length > 0 && (
        <div className="mt-6">
          <ReferenceFigures
            figures={section.figures}
            assetRoot="/far/images"
            query={effectiveQuery}
            fallbackLabel={`FAR ${section.section} figure`}
          />
        </div>
      )}

      {/* Definitions */}
      {section.definitions && section.definitions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-foreground/70 mb-3 uppercase tracking-wide">
            Definitions
          </h4>
          <dl className="space-y-3">
            {section.definitions.map((def) => (
              <div key={def.term} className="bg-muted/50 rounded-lg p-4">
                <dt className="font-semibold text-foreground mb-1">
                  {def.term}
                </dt>
                <dd className="text-sm text-muted-foreground">
                  {def.definition}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Abbreviations */}
      {section.abbreviations && section.abbreviations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-foreground/70 mb-3 uppercase tracking-wide">
            Abbreviations
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {section.abbreviations.map((abbr) => (
              <div
                key={abbr.abbr}
                className="flex items-baseline gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2"
              >
                <span className="font-mono font-semibold text-primary">
                  {abbr.abbr}
                </span>
                <span className="text-muted-foreground">
                  {abbr.meaning}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Points */}
      {section.keyPoints && section.keyPoints.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-foreground/70 mb-3 uppercase tracking-wide">
            Key Points
          </h4>
          <ul className="space-y-2">
            {section.keyPoints.map((point, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
