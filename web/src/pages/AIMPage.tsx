import { useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ChevronLeft, BookOpen, ChevronDown, ChevronUp, Image as ImageIcon, Search, Brain, Layers, History, Loader2, FileText, List, Link2, Check } from 'lucide-react';
import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import { getAllAIMChapters, getAIMChapter, AIMChapter, AIMChapterMeta, AIMSection, AIMSubsection, getQuizForAIMChapter, getFlashcardsForAIMChapter } from '../data';
import type { SearchResult } from '../data/search';
import { HighlightText } from '../components/HighlightText';
import { FormattedContent } from '../components/FormattedContent';
import { useReadingHistory } from '../hooks/useReadingHistory';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { StudyMarkTools } from '../components/StudyMarkTools';
import { ReaderControls } from '../components/ReaderControls';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { ReferenceFigures } from '../components/ReferenceFigures';
import { formatAIMChapterBadge, formatAIMChapterLabel } from '../lib/aim';
import { useRouteData } from '../context/route-data';
import { MobileTableOfContents } from '../components/MobileTableOfContents';

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
  const [contentSearchResults, setContentSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await (await import('../data/search')).searchContent(filterQuery, ['aim']);
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

  // Compute chapter matches with priority: title > content
  const chapterMatches = useMemo((): ChapterSearchMatch[] => {
    if (!filterQuery) {
      // No query - return all chapters with no matches
      return chapters.map(c => ({ chapter: c, titleMatch: false, contentMatches: [] }));
    }

    const query = filterQuery.toLowerCase();
    const results: ChapterSearchMatch[] = [];

    for (const chapter of chapters) {
      const titleMatch = 
        chapter.chapter.toString().includes(query) || 
        chapter.title.toLowerCase().includes(query);
      
      // Filter content search results to this chapter
      const contentMatches = contentSearchResults.filter(r => {
        // Link format: /aim/X?highlight=... or /aim/X#section
        const match = r.link.match(/\/aim\/(\d+)/);
        return match && parseInt(match[1]) === chapter.chapter;
      });

      // Include chapter if title matches OR has content matches
      if (titleMatch || contentMatches.length > 0) {
        results.push({ chapter, titleMatch, contentMatches });
      }
    }

    // Sort: title matches first, then by chapter number
    results.sort((a, b) => {
      if (a.titleMatch && !b.titleMatch) return -1;
      if (!a.titleMatch && b.titleMatch) return 1;
      // Both have same title match status - sort by content match count then chapter
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
  // Start with all sections expanded for easier navigation
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    return new Set(chapter.sections?.map(s => s.section) || []);
  });
  const [searchQuery, setSearchQuery] = useState('');
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

  // Reset expanded sections when chapter changes (expand all by default)
  useEffect(() => {
    setExpandedSections(new Set(chapter.sections?.map(s => s.section) || []));
  }, [chapter.chapter, chapter.sections]);

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Memoize sections to avoid lint warning
  const sections = useMemo(() => chapter.sections || [], [chapter.sections]);

  const [activeSectionId, setActiveSectionId] = useState<string>('');

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
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    if (sections.length === 0) return;

    const elements = sections
      .map((s) => document.getElementById(s.section))
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
  }, [sections]);

  // Filter sections if search is active
  const filteredSections = useMemo(() => {
    if (!searchQuery) return sections;
    const query = searchQuery.toLowerCase();

    return sections.filter(section => {
      // Check section main fields
      if (section.section.toLowerCase().includes(query)) return true;
      if (section.title?.toLowerCase().includes(query)) return true;
      if (section.content?.toLowerCase().includes(query)) return true;

      // Check subsections
      if (section.subsections?.some(sub =>
        sub.title.toLowerCase().includes(query) ||
        sub.content.toLowerCase().includes(query)
      )) return true;

      return false;
    });
  }, [sections, searchQuery]);

  // Auto-expand sections that match search
  useEffect(() => {
    if (searchQuery && filteredSections.length < sections.length) {
      const newExpanded = new Set<string>();
      filteredSections.forEach(s => newExpanded.add(s.section));
      setExpandedSections(newExpanded);
    }
  }, [filteredSections, searchQuery, sections.length]);

  // When there's a highlight term (from search), find and scroll to the first matching section
  useEffect(() => {
    if (highlightTerm && sections.length > 0) {
      const query = highlightTerm.toLowerCase();
      
      // Find the first section that contains the highlight term
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

      if (matchingSection) {
        // Make sure the section is expanded
        setExpandedSections(prev => new Set([...prev, matchingSection.section]));
        
        // Set the highlighted section for flash effect
        setHighlightedSectionId(matchingSection.section);
        
        // Scroll to the section after a short delay to allow render
        setTimeout(() => {
          const element = document.getElementById(matchingSection.section);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);

        // Clear highlight after animation
        setTimeout(() => {
          setHighlightedSectionId(null);
        }, 3000);
      }
    }
  }, [highlightTerm, sections]);


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
        )}

        {/* Right Content Area */}
        <div className="min-w-0">
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
            <MobileTableOfContents
              title={`AIM ${formatAIMChapterLabel(chapter.chapter)} Contents`}
              items={tocItems}
              activeId={activeSectionId}
            />
          )}

          {/* Sections */}
          <div className="space-y-6">
            {filteredSections.map((section) => (
              <SectionView
                key={section.section}
                chapterId={chapter.chapter}
                section={section}
                isExpanded={expandedSections.has(section.section)}
                onToggle={() => toggleSection(section.section)}
                searchQuery={searchQuery}
                highlightTerm={highlightTerm}
                isHighlighted={highlightedSectionId === section.section}
                contentStyle={readerControls.contentStyle}
              />
            ))}
            {filteredSections.length === 0 && (
               <div className="text-center py-12 text-muted-foreground">
                 No sections found matching "{searchQuery}"
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
            <div className="flex items-center justify-between gap-4">
              {prevChapter ? (
                <Link
                  to={`/aim/${prevChapter.chapter}`}
                  className="flex-1 group flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Previous</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      Ch. {prevChapter.chapter}: {prevChapter.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="flex-1" />
              )}
              
              {nextChapter ? (
                <Link
                  to={`/aim/${nextChapter.chapter}`}
                  className="flex-1 group flex items-center justify-end gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all"
                >
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      Ch. {nextChapter.chapter}: {nextChapter.title}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </div>
        </div>
      </div>

      <ReaderControls state={readerControls} />
    </div>
  );
}

function SectionView({ 
  chapterId,
  section, 
  isExpanded, 
  onToggle,
  searchQuery,
  highlightTerm,
  isHighlighted,
  contentStyle
}: { 
  chapterId: number;
  section: AIMSection; 
  isExpanded: boolean; 
  onToggle: () => void;
  searchQuery: string;
  highlightTerm?: string;
  isHighlighted?: boolean;
  contentStyle: CSSProperties;
}) {
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const hasContent = section.content && section.content.length > 0;
  const hasFigures = section.figures && section.figures.length > 0;
  const hasTables = section.tables && section.tables.length > 0;

  // Flash highlight effect when scrolled to via hash or highlighted from search
  const [isFlashed, setIsFlashed] = useState(false);
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
      className={`bg-card rounded-xl shadow-sm border border-border transition-colors duration-500 ${
        isFlashed ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
    >
      <div className="w-full flex items-center justify-between p-6">
        <button
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`section-${section.section}-content`}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} AIM ${section.section}`}
          className="flex-1 flex items-center gap-3 pr-4 text-left group"
        >
          <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
            <HighlightText text={section.section} query={effectiveQuery} />. <HighlightText text={section.title || ''} query={effectiveQuery} />
          </h2>
          {hasFigures && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs rounded-full">
              <ImageIcon className="w-3 h-3" />
              {section.figures!.length}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            title="Copy link to this section"
            aria-label={`Copy link to section ${section.section}`}
            className="text-muted-foreground hover:text-primary p-2 rounded-lg hover:bg-accent transition-colors"
          >
            {copied ? (
              <span className="text-xs text-primary font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Copied
              </span>
            ) : (
              <Link2 className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={`section-${section.section}-content`}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} AIM ${section.section}`}
            className="text-muted-foreground hover:text-primary p-2 rounded-lg hover:bg-accent transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 flex-shrink-0" />
            )}
          </button>
        </div>
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
                className="text-muted-foreground"
                highlight={effectiveQuery}
                stripTableBlocks={hasTables}
                tableCaption={`AIM ${section.section}: ${section.title}`}
                style={contentStyle}
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
                  <table className="min-w-full divide-y divide-border" style={contentStyle}>
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
                    contentStyle={contentStyle}
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
}

function SubsectionView({
  subsection,
  searchQuery,
  highlightTerm,
  contentStyle,
}: {
  subsection: AIMSubsection;
  searchQuery: string;
  highlightTerm?: string;
  contentStyle: CSSProperties;
}) {
  const effectiveQuery = searchQuery || highlightTerm || '';
  return (
    <div id={subsection.subsection} className="bg-muted/50 rounded-lg p-4">
      <h3 className="font-semibold text-foreground mb-2">
        <HighlightText text={subsection.subsection} query={effectiveQuery} />. <HighlightText text={subsection.title} query={effectiveQuery} />
      </h3>
      <FormattedContent 
        text={subsection.content} 
        className="text-muted-foreground mb-4"
        highlight={effectiveQuery}
        style={contentStyle}
      />

      {/* Key Points */}
      {subsection.keyPoints && subsection.keyPoints.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Key Points
          </h4>
          <ul className="space-y-1">
            {subsection.keyPoints.map((point: string, index: number) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Additional structured content */}
      {subsection.characteristics && Array.isArray(subsection.characteristics) && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Characteristics
          </h4>
          <ul className="space-y-1">
            {(subsection.characteristics as string[]).map((char: string, index: number) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                {char}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
