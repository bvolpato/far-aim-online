import { useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ChevronLeft, BookOpen, ChevronDown, ChevronUp, Image as ImageIcon, Search, Brain, Layers, History, Loader2, FileText, List, Check } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useState, useMemo, useEffect } from 'react';
import { getAIMChapter } from '../data/aim';
import { getAllAIMChapters, getQuizForAIMChapter, getFlashcardsForAIMChapter } from '../data/catalog';
import type { AIMChapter, AIMChapterMeta, AIMSection, AIMSubsection } from '../data/types';
import type { SearchResult } from '../data/search';
import { HighlightText } from '../components/HighlightText';
import { FormattedContent } from '../components/FormattedContent';
import { useReadingHistory } from '../hooks/useReadingHistory';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { StudyMarkTools } from '../components/StudyMarkTools';
import { ReaderControls } from '../components/ReaderControls';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useActiveSectionId } from '../hooks/useActiveSectionId';
import { ReferenceFigures } from '../components/ReferenceFigures';
import { formatAIMChapterBadge, formatAIMChapterLabel } from '../lib/aim';
import { useRouteData } from '../context/route-data';
import { MobileTableOfContents, type TocItem } from '../components/MobileTableOfContents';

// Content search result for chapter listing
interface ChapterSearchMatch {
  chapter: AIMChapterMeta;
  titleMatch: boolean;
  contentMatches: SearchResult[];
}

export function AIMPage() {
  const { chapterId } = useParams();
  const { aimChapter } = useRouteData();
  const initialChapter = aimChapter?.chapter.toString() === chapterId ? aimChapter : undefined;
  const chapters = getAllAIMChapters();
  const [selectedChapter, setSelectedChapter] = useState<AIMChapter | null>(initialChapter ?? null);
  const [loading, setLoading] = useState(Boolean(chapterId && !initialChapter));
  const [loadError, setLoadError] = useState<'not-found' | 'load-failed' | null>(null);

  const { getLastViewed } = useReadingHistory();
  const lastViewed = getLastViewed('aim');

  const [filterQuery, setFilterQuery] = useState('');
  const [isIndexSearchInteractive, setIsIndexSearchInteractive] = useState(false);
  const [contentSearchResults, setContentSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsIndexSearchInteractive(true);
  }, []);

  // Load selected chapter data
  useEffect(() => {
    if (initialChapter) {
      setSelectedChapter(initialChapter);
      setLoading(false);
      setLoadError(null);
      return;
    }
    if (!chapterId) {
      setSelectedChapter(null);
      setLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setSelectedChapter(null);
    setLoadError(null);

    if (!/^\d+$/.test(chapterId)) {
      setLoadError('not-found');
      setLoading(false);
      return;
    }

    setLoading(true);
    void getAIMChapter(Number(chapterId))
      .then((chapter) => {
        if (!cancelled) {
          setSelectedChapter(chapter || null);
          setLoadError(chapter ? null : 'not-found');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load AIM chapter:', error);
          setSelectedChapter(null);
          setLoadError('load-failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chapterId, initialChapter]);

  useEffect(() => {
    if (filterQuery.length < 3) {
      setContentSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await (await import('../data/search')).searchContent(filterQuery, ['aim'], undefined, {
          signal: controller.signal,
        });
        if (!cancelled) setContentSearchResults(results);
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Search error:', error);
          setContentSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [filterQuery]);

  // Compute chapter matches with priority: title > content
  const chapterMatches = useMemo((): ChapterSearchMatch[] => {
    if (!filterQuery) {
      return chapters.map(c => ({ chapter: c, titleMatch: false, contentMatches: [] }));
    }

    const query = filterQuery.toLowerCase();
    const matchesByChapter = new Map<number, SearchResult[]>();
    for (const r of contentSearchResults) {
      const match = r.link.match(/\/aim\/(\d+)/);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      let bucket = matchesByChapter.get(num);
      if (!bucket) {
        bucket = [];
        matchesByChapter.set(num, bucket);
      }
      bucket.push(r);
    }

    const results: ChapterSearchMatch[] = [];
    for (const chapter of chapters) {
      const titleMatch =
        chapter.chapter.toString().includes(query) ||
        chapter.title.toLowerCase().includes(query);

      const contentMatches = matchesByChapter.get(chapter.chapter) || [];

      if (titleMatch || contentMatches.length > 0) {
        results.push({ chapter, titleMatch, contentMatches });
      }
    }

    // Sort: title matches first, then by content match count, then by chapter number
    results.sort((a, b) => {
      if (a.titleMatch && !b.titleMatch) return -1;
      if (!a.titleMatch && b.titleMatch) return 1;
      if (a.contentMatches.length !== b.contentMatches.length) {
        return b.contentMatches.length - a.contentMatches.length;
      }
      return a.chapter.chapter - b.chapter.chapter;
    });

    return results;
  }, [chapters, filterQuery, contentSearchResults]);

  // Find previous and next chapters for navigation
  const navigation = useMemo(() => {
    if (!selectedChapter) return { prev: null, next: null };
    const currentIndex = chapters.findIndex(c => c.chapter === selectedChapter.chapter);
    return {
      prev: currentIndex > 0 ? chapters[currentIndex - 1] : null,
      next: currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null,
    };
  }, [selectedChapter, chapters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (selectedChapter) {
    return <AIMChapterView chapter={selectedChapter} prevChapter={navigation.prev} nextChapter={navigation.next} />;
  }

  if (chapterId && loadError) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {loadError === 'not-found' ? 'AIM chapter not found' : 'AIM chapter unavailable'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {loadError === 'not-found'
            ? `Chapter ${chapterId} is not included in this edition.`
            : 'Content could not be loaded. Check connection and try again.'}
        </p>
        <Link className="mt-5 font-medium text-primary hover:underline" to="/aim">
          Browse AIM index
        </Link>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Aeronautical Information Manual | FAR/AIM Online</title>
        <meta name="description" content="Browse and search the FAA Aeronautical Information Manual for pilot study and reference." />
        <link rel="canonical" href="https://faraim.online/aim" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Aeronautical Information Manual
        </h1>
        <p className="text-muted-foreground">
          FAA's official guide to basic flight information and ATC procedures
        </p>
      </div>

      {/* Continue Reading Banner */}
      {lastViewed && (
        <Link
          to={lastViewed.path}
          className="mb-6 flex items-center gap-4 p-4 bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 dark:from-emerald-500/20 dark:to-emerald-600/10 rounded-xl border border-emerald-200 dark:border-emerald-800/50 hover:shadow-md transition-all group"
        >
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <History className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Continue Reading</p>
            <p className="text-foreground font-semibold group-hover:text-primary transition-colors">
              {Number(lastViewed.id) === 0
                ? lastViewed.title
                : `${formatAIMChapterLabel(lastViewed.id)}: ${lastViewed.title}`}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {/* Filter Input */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search chapters by title or content..."
          value={filterQuery}
          disabled={!isIndexSearchInteractive}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none text-foreground placeholder:text-muted-foreground"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-emerald-500 animate-spin" />
        )}
      </div>

      {/* Search Results Summary */}
      {filterQuery && filterQuery.length >= 3 && !isSearching && (
        <div className="mb-4 text-sm text-muted-foreground">
          Found {chapterMatches.length} chapter{chapterMatches.length !== 1 ? 's' : ''} matching "{filterQuery}"
          {contentSearchResults.length > 0 && (
            <span> ({contentSearchResults.length} content match{contentSearchResults.length !== 1 ? 'es' : ''})</span>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {chapterMatches.map(({ chapter, titleMatch, contentMatches }) => (
          <div key={chapter.chapter} className="space-y-2">
            <Link
              to={`/aim/${chapter.chapter}`}
              className="group bg-card rounded-xl p-6 shadow-sm hover:shadow-lg transition-all border border-border card-hover block"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-semibold rounded-lg">
                      {formatAIMChapterBadge(chapter.chapter)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {chapter.sectionCount || 0} sections
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
                    <HighlightText text={chapter.title} query={filterQuery} />
                  </h2>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
              </div>
            </Link>

            {/* Show top content matches for this chapter */}
            {contentMatches.length > 0 && (
              <div className="ml-4 space-y-2">
                {contentMatches.slice(0, 3).map((match, idx) => (
                  <Link
                    key={idx}
                    to={match.link}
                    className="block p-3 bg-secondary/50 rounded-lg border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
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
                    to={`/aim/${chapter.chapter}?highlight=${encodeURIComponent(filterQuery)}`}
                    className="block text-sm text-emerald-600 dark:text-emerald-400 hover:underline ml-6"
                  >
                    View all {contentMatches.length} matches in {formatAIMChapterLabel(chapter.chapter)}...
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}

        {chapterMatches.length === 0 && filterQuery && (
          <div className="text-center py-12 text-muted-foreground">
            No chapters found matching "{filterQuery}"
          </div>
        )}
      </div>
      </div>
    </>
  );
}

const AIMDesktopToc = memo(function AIMDesktopToc({
  sections,
  observedIds,
  onExpandSection,
}: {
  sections: AIMSection[];
  observedIds: string[];
  onExpandSection: (sectionId: string) => void;
}) {
  const activeSectionId = useActiveSectionId(observedIds);

  return (
    <aside className="sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto bg-card rounded-2xl p-5 border border-border shadow-sm hidden lg:block">
      <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2 border-b pb-2">
        <List className="w-4 h-4 text-primary" />
        Sections ({sections.length})
      </h2>
      <nav className="space-y-1.5">
        {sections.map((section) => {
          const isActive = activeSectionId === section.section;
          return (
            <a
              key={section.section}
              href={`#${section.section}`}
              onClick={() => onExpandSection(section.section)}
              className={`block text-xs px-2.5 py-2 rounded-lg transition-colors truncate ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-primary hover:bg-accent/50'
              }`}
              title={`§ ${section.section} - ${section.title}`}
            >
              <span className="font-semibold text-foreground/80 mr-1">{section.section}</span>
              {section.title}
            </a>
          );
        })}
      </nav>
    </aside>
  );
});

const AIMMobileToc = memo(function AIMMobileToc({
  chapterNumber,
  tocItems,
  observedIds,
  onExpandSection,
}: {
  chapterNumber: number;
  tocItems: TocItem[];
  observedIds: string[];
  onExpandSection: (sectionId: string) => void;
}) {
  const activeSectionId = useActiveSectionId(observedIds);

  return (
    <MobileTableOfContents
      title={`AIM ${formatAIMChapterLabel(chapterNumber)} Contents`}
      items={tocItems}
      activeId={activeSectionId}
      onSelect={onExpandSection}
    />
  );
});

function AIMChapterView({
  chapter,
  prevChapter,
  nextChapter
}: {
  chapter: AIMChapter;
  prevChapter: AIMChapterMeta | null;
  nextChapter: AIMChapterMeta | null;
}) {
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const activeHashId = hash.startsWith('#') ? hash.slice(1) : '';
  // Keep reference content readable before JavaScript and during hydration.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    return new Set(chapter.sections?.map(s => s.section) || []);
  });
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const highlightTerm = searchParams.get('highlight') || '';
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);
  const readerControls = useReaderPreferences();

  const { addToHistory } = useReadingHistory();

  // Get chapter study materials
  const chapterQuiz = getQuizForAIMChapter(chapter.chapter);
  const chapterFlashcards = getFlashcardsForAIMChapter(chapter.chapter);

  // Save reading history when chapter is viewed
  useEffect(() => {
    addToHistory({
      type: 'aim',
      id: chapter.chapter,
      title: chapter.title,
      path: `/aim/${chapter.chapter}`,
    });
  }, [chapter.chapter, chapter.title, addToHistory]);

  useEffect(() => {
    setExpandedSections(new Set());
    setSearchQuery('');
  }, [chapter.chapter, chapter.sections]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const expandSection = useCallback((sectionId: string) => {
    setExpandedSections((previous) => (previous.has(sectionId) ? previous : new Set([...previous, sectionId])));
  }, []);

  // Memoize sections to avoid lint warning
  const sections = useMemo(() => chapter.sections || [], [chapter.sections]);
  const observedIds = useMemo(() => sections.map((s) => s.section), [sections]);

  const tocItems = useMemo(
    () =>
      sections.map((s) => ({
        id: s.section,
        label: `§ ${s.section}`,
        title: s.title,
      })),
    [sections]
  );

  useEffect(() => {
    const sectionId = hash.slice(1);
    if (!sections.some(section => section.section === sectionId)) return;
    setExpandedSections(previous => new Set([...previous, sectionId]));
    const timer = setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start' });
    }, 100);
    return () => clearTimeout(timer);
  }, [hash, sections]);

  // Filter sections if search is active
  const filteredSections = useMemo(() => {
    if (!deferredSearchQuery) return sections;
    const query = deferredSearchQuery.toLowerCase();

    return sections.filter(section => {
      if (section.section.toLowerCase().includes(query)) return true;
      if (section.title?.toLowerCase().includes(query)) return true;
      if (section.content?.toLowerCase().includes(query)) return true;

      if (section.subsections?.some(sub =>
        sub.title.toLowerCase().includes(query) ||
        sub.content.toLowerCase().includes(query)
      )) return true;

      return false;
    });
  }, [sections, deferredSearchQuery]);

  // Auto-expand sections that match search
  useEffect(() => {
    if (deferredSearchQuery) {
      const newExpanded = new Set<string>();
      filteredSections.forEach(s => newExpanded.add(s.section));
      setExpandedSections(newExpanded);
    }
  }, [filteredSections, deferredSearchQuery, sections.length]);

  // When there's a highlight term (from search), find and scroll to the first matching section
  useEffect(() => {
    if (!highlightTerm || sections.length === 0 || sections.some(section => hash === `#${section.section}`)) {
      return;
    }

    const query = highlightTerm.toLowerCase();
    const matchingSection = sections.find(section => {
      if (section.section.toLowerCase().includes(query)) return true;
      if (section.title?.toLowerCase().includes(query)) return true;
      if (section.content?.toLowerCase().includes(query)) return true;
      if (section.subsections?.some(sub =>
        sub.title.toLowerCase().includes(query) ||
        sub.content.toLowerCase().includes(query)
      )) return true;
      return false;
    });

    if (!matchingSection) return;

    setExpandedSections(prev => new Set([...prev, matchingSection.section]));
    setHighlightedSectionId(matchingSection.section);

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(matchingSection.section)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    const clearTimer = window.setTimeout(() => {
      setHighlightedSectionId(null);
    }, 3000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightTerm, hash, sections]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>{`AIM ${formatAIMChapterLabel(chapter.chapter)} - ${chapter.title} | FAR/AIM Online`}</title>
        <meta name="description" content={`Aeronautical Information Manual (AIM) ${formatAIMChapterLabel(chapter.chapter)} - ${chapter.title}. Official FAA guidance and procedures.`} />
        <link rel="canonical" href={`https://faraim.online/aim/${chapter.chapter}`} />
      </Helmet>

      {/* Breadcrumb */}
      <Breadcrumbs
        items={[
          { label: 'AIM', path: '/aim' },
          { label: formatAIMChapterLabel(chapter.chapter) }
        ]}
        className="mb-6"
      />

      {/* Search Bar */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search within this chapter..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start mt-6">
        {/* Left Sticky Sidebar (Desktop only) */}
        {!searchQuery && sections.length > 0 && (
          <AIMDesktopToc
            sections={sections}
            observedIds={observedIds}
            onExpandSection={expandSection}
          />
        )}

        {/* Right Content Area */}
        <div className="min-w-0" style={readerControls.cssVars}>
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {formatAIMChapterLabel(chapter.chapter)}
                </p>
                <h1 className="text-2xl font-bold text-foreground">
                  {chapter.title}
                </h1>
              </div>
            </div>
          </div>

          {/* Mobile Table of Contents Drawer */}
          {!searchQuery && sections.length > 0 && (
            <AIMMobileToc
              chapterNumber={chapter.chapter}
              tocItems={tocItems}
              observedIds={observedIds}
              onExpandSection={expandSection}
            />
          )}

          {/* Sections */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExpandedSections(new Set(filteredSections.map(section => section.section)))}
              className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpandedSections(new Set())}
              className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent"
            >
              Collapse all
            </button>
          </div>
          <div className="space-y-6">
            {filteredSections.map((section) => (
              <SectionView
                key={section.section}
                chapterId={chapter.chapter}
                section={section}
                isExpanded={expandedSections.has(section.section)}
                onToggleSection={toggleSection}
                searchQuery={deferredSearchQuery}
                highlightTerm={highlightTerm}
                isHighlighted={highlightedSectionId === section.section}
                isHashTarget={activeHashId === section.section}
              />
            ))}
            {filteredSections.length === 0 && (
               <div className="text-center py-12 text-muted-foreground">
                 No sections found matching "{deferredSearchQuery}"
               </div>
            )}
          </div>

          {/* Study Materials Section */}
          {(chapterQuiz || chapterFlashcards) && (
            <div className="mt-12 pt-8 border-t border-border">
              <h2 className="text-lg font-bold text-foreground mb-4">
                Study Materials for {formatAIMChapterLabel(chapter.chapter)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {chapterQuiz && (
                  <Link
                    to={`/quizzes/${chapterQuiz.id}`}
                    className="group flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-purple-600/5 dark:from-purple-500/20 dark:to-purple-600/10 rounded-xl border border-purple-200 dark:border-purple-800/50 hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-purple-700 dark:text-purple-300 font-medium">Practice Quiz</p>
                      <p className="text-foreground font-semibold group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {chapterQuiz.questionCount} questions
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-purple-500 group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}
                {chapterFlashcards && (
                  <Link
                    to={`/flashcards/${chapterFlashcards.id}`}
                    className="group flex items-center gap-4 p-4 bg-gradient-to-r from-amber-500/10 to-amber-600/5 dark:from-amber-500/20 dark:to-amber-600/10 rounded-xl border border-amber-200 dark:border-amber-800/50 hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Layers className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Flashcards</p>
                      <p className="text-foreground font-semibold group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {chapterFlashcards.cardCount} cards
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
              {prevChapter ? (
                <Link
                  to={`/aim/${prevChapter.chapter}`}
                  className="w-full min-w-0 group flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all sm:flex-1"
                >
                  <ChevronLeft className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="text-left min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Previous</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      Ch. {prevChapter.chapter}: {prevChapter.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="hidden sm:block sm:flex-1" />
              )}

              {nextChapter ? (
                <Link
                  to={`/aim/${nextChapter.chapter}`}
                  className="w-full min-w-0 group flex items-center justify-end gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all sm:flex-1"
                >
                  <div className="text-right min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      Ch. {nextChapter.chapter}: {nextChapter.title}
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

const SectionView = memo(function SectionView({
  chapterId,
  section,
  isExpanded,
  onToggleSection,
  searchQuery,
  highlightTerm,
  isHighlighted,
  isHashTarget,
}: {
  chapterId: number;
  section: AIMSection;
  isExpanded: boolean;
  onToggleSection: (sectionId: string) => void;
  searchQuery: string;
  highlightTerm?: string;
  isHighlighted?: boolean;
  isHashTarget?: boolean;
}) {
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const hasContent = section.content && section.content.length > 0;
  const hasFigures = section.figures && section.figures.length > 0;
  const hasTables = section.tables && section.tables.length > 0;

  // Flash highlight effect when scrolled to via hash or highlighted from search
  const [isFlashed, setIsFlashed] = useState(false);

  useEffect(() => {
    if (isHashTarget) {
      setIsFlashed(true);
      const timer = setTimeout(() => setIsFlashed(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHashTarget]);

  useEffect(() => {
    if (isHighlighted) {
      setIsFlashed(true);
      const timer = setTimeout(() => setIsFlashed(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  const effectiveQuery = searchQuery || highlightTerm || '';
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/aim/${chapterId}#${section.section}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      id={section.section}
      className={`cv-section bg-card rounded-xl shadow-sm border border-border transition-colors duration-500 ${
        isFlashed ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
    >
      <div className="flex w-full min-w-0 items-center justify-between p-4 sm:p-6">
        <button
          onClick={() => onToggleSection(section.section)}
          aria-expanded={isExpanded}
          aria-controls={`section-${section.section}-content`}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} AIM ${section.section}`}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3 text-left group sm:pr-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="min-w-0 break-words text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              <HighlightText text={section.section} query={effectiveQuery} />. <HighlightText text={section.title || ''} query={effectiveQuery} />
            </h2>
            {hasFigures && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs rounded-full">
                <ImageIcon className="w-3 h-3" />
                {section.figures!.length}
              </span>
            )}
          </div>
          <span className="text-muted-foreground group-hover:text-primary transition-colors">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 flex-shrink-0" />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          title="Copy link to this section"
          aria-label={`Copy link to section ${section.section}`}
          className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
        >
          {copied ? (
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Copied
            </span>
          ) : (
            <svg className="sm-ico-only" aria-hidden="true"><use href="#sm-lk" /></svg>
          )}
        </button>
      </div>

      {isExpanded && (
        <div id={`section-${section.section}-content`} className="px-6 pb-6 space-y-6 border-t border-border pt-4">
          <StudyMarkTools
            type="aim"
            reference={`AIM ${section.section}`}
            title={section.title || `AIM ${section.section}`}
            path={`/aim/${chapterId}#${section.section}`}
            compact
          />

          {/* Direct section content (new format) */}
          {hasContent && section.content && (
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <FormattedContent
                text={section.content}
                className="reader-content text-muted-foreground"
                highlight={effectiveQuery}
                stripTableBlocks={hasTables}
                tableCaption={`AIM ${section.section}: ${section.title}`}
              />
            </div>
          )}

          {/* Figures/Images */}
          {hasFigures && (
            <ReferenceFigures
              figures={section.figures!}
              assetRoot="/aim/images"
              query={effectiveQuery}
              fallbackLabel={`AIM ${section.section} figure`}
            />
          )}

          {/* Tables */}
          {hasTables && (
            <div className="space-y-4">
              {section.tables!.map((table, idx) => (
                <div key={idx} className="overflow-x-auto rounded-lg border border-border">
                  <table className="reader-content min-w-full divide-y divide-border">
                    <caption className="caption-top px-3 py-2 text-left text-sm font-semibold text-foreground">
                      {table.caption?.trim() || `AIM ${section.section}: ${section.title}, table ${idx + 1}`}
                    </caption>
                    {table.headers && table.headers.length > 0 && (
                      <thead className="bg-muted/50">
                        <tr>
                          {table.headers.map((header, hIdx) => (
                            <th
                              key={hIdx}
                              scope="col"
                              className="px-3 py-2 text-left font-semibold text-foreground"
                            >
                              <HighlightText text={header} query={effectiveQuery} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody className="bg-card divide-y divide-border">
                      {table.rows?.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3 py-2 align-top text-muted-foreground whitespace-pre-line"
                            >
                              <HighlightText text={cell} query={effectiveQuery} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Subsections (old format compatibility) */}
          {hasSubsections && section.subsections!.map((subsection) => (
            <SubsectionView
              key={subsection.subsection}
              subsection={subsection}
              searchQuery={searchQuery}
              highlightTerm={highlightTerm}
            />
          ))}

          {/* Empty state */}
          {!hasContent && !hasSubsections && !hasFigures && !hasTables && (
            <p className="text-sm text-muted-foreground italic">
              No content available for this section.
            </p>
          )}
        </div>
      )}
    </div>
  );
});

const SubsectionView = memo(function SubsectionView({
  subsection,
  searchQuery,
  highlightTerm,
}: {
  subsection: AIMSubsection;
  searchQuery: string;
  highlightTerm?: string;
}) {
  const effectiveQuery = searchQuery || highlightTerm || '';

  return (
    <div id={subsection.subsection} className="pl-4 border-l-2 border-emerald-200 dark:border-emerald-800 scroll-mt-24">
      <h3 className="text-base font-semibold text-foreground mb-2">
        <HighlightText text={subsection.subsection} query={effectiveQuery} /> {subsection.title && <HighlightText text={subsection.title} query={effectiveQuery} />}
      </h3>
      {subsection.content && (
        <FormattedContent
          text={subsection.content}
          className="reader-content text-muted-foreground mb-3"
          highlight={effectiveQuery}
          tableCaption={subsection.title || `AIM ${subsection.subsection}`}
        />
      )}

      {subsection.keyPoints && subsection.keyPoints.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Key Points
          </h4>
          <ul className="space-y-1">
            {subsection.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {subsection.characteristics && subsection.characteristics.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Characteristics
          </h4>
          <ul className="space-y-1">
            {subsection.characteristics.map((char, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                {char}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
