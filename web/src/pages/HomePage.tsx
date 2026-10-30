import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Book,
  Brain,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  GitPullRequest,
  Layers,
  Search,
  ClipboardList,
  Download,
  Smartphone,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useReadingHistory } from '../hooks/useReadingHistory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getAllFARParts,
  getAllAIMChapters,
  getAllQuizzes,
  getAllFlashcardDecks,
  getStudyPaths,
  getSourceStatus,
} from '../data/catalog';
import { androidRelease, iosAppUrl } from '@/lib/mobileApps';

export function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { history } = useReadingHistory();
  const recentItems = history.slice(0, 3);
  const farParts = getAllFARParts();
  const aimChapters = getAllAIMChapters().filter((chapter) => chapter.chapter > 0);
  const quizzes = getAllQuizzes();
  const flashcardDecks = getAllFlashcardDecks();
  const studyPaths = getStudyPaths();
  const sources = getSourceStatus().sources;
  const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]));
  const totalQuestions = quizzes.reduce((sum, quiz) => sum + quiz.questionCount, 0);
  const totalCards = flashcardDecks.reduce((sum, deck) => sum + deck.cardCount, 0);

  const references = [
    {
      to: '/far',
      title: 'Federal Aviation Regulations',
      description: 'The rules, from certification to flight operations.',
      detail: `${farParts.length} parts`,
      icon: FileText,
    },
    {
      to: '/aim',
      title: 'Aeronautical Information Manual',
      description: 'Procedures, airspace, navigation, and figures.',
      detail: `${aimChapters.length} chapters + appendices`,
      icon: BookOpen,
    },
    {
      to: '/glossary',
      title: 'Pilot/Controller Glossary',
      description: 'Make sense of the language on the frequency.',
      detail: `${(sourceById.pcg?.itemCount ?? 0).toLocaleString('en-US')} terms`,
      icon: Book,
    },
    {
      to: '/advisory-circulars',
      title: 'Advisory Circulars',
      description: 'FAA guidance with links to official pages and PDFs.',
      detail: `${sourceById.ac?.itemCount ?? 0} circulars`,
      icon: ClipboardList,
    },
  ];

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery) navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <>
      <Helmet>
        <title>FAR/AIM Online | Free Aviation Reference &amp; Study Tools</title>
        <meta
          name="description"
          content="Search FAA regulations and guidance, save references, and study with quizzes and flashcards. FAR/AIM Online is free to use, open source, and welcomes pull requests."
        />
        <meta property="og:title" content="FAR/AIM Online | Free Aviation Reference &amp; Study Tools" />
        <meta
          property="og:description"
          content="Search FAA regulations and guidance, save references, and study with quizzes and flashcards. Free to use and open source."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
      </Helmet>

      <div className="home-page">
        <section className="home-hero">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.6fr_1fr] lg:items-center lg:gap-16 lg:px-8 lg:py-16">
            <div className="min-w-0">
              <p className="home-eyebrow text-[#a5d5e9]">FREE &amp; OPEN SOURCE FOR PILOTS</p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
                Find the reference.
                <br />
                <span className="text-[#a5d5e9]">Free and open source.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-200 sm:text-lg">
                Search FAA regulations and guidance, save references, and study with focused quizzes
                and flashcards.
              </p>

              <form
                onSubmit={handleSearch}
                action="/search"
                method="get"
                role="search"
                aria-label="Reference search"
                className="mt-7"
              >
                <label htmlFor="home-search" className="sr-only">
                  Search aviation references
                </label>
                <div className="flex items-center gap-2 rounded-xl bg-white p-2 text-slate-900 shadow-lg focus-within:ring-2 focus-within:ring-[#a5d5e9] focus-within:ring-offset-2 focus-within:ring-offset-[#102b40]">
                  <Search className="ml-2 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                  <input
                    id="home-search"
                    name="q"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="A topic, term, or regulation…"
                    className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-slate-500"
                  />
                  <Button
                    type="submit"
                    aria-label="Search references"
                    className="h-11 shrink-0 bg-[#102b40] px-3 text-white hover:bg-[#244b67] sm:px-4"
                  >
                    <span className="hidden sm:inline">Search</span>
                    <ArrowRight className="h-4 w-4 sm:ml-2" aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-200">
                  <span className="text-slate-300">Try</span>
                  {['91.205', 'Airspace', 'Weather minimums'].map((term) => (
                    <Link
                      key={term}
                      to={`/search?q=${encodeURIComponent(term)}`}
                      className="underline decoration-white/35 underline-offset-4 hover:text-white hover:decoration-white"
                    >
                      {term}
                    </Link>
                  ))}
                </div>
              </form>
              <p className="mt-6 text-xs tracking-wide text-slate-300">
                No account, subscription, or in-app purchases.
              </p>
              <nav aria-label="Mobile app downloads" className="mt-5 flex flex-wrap gap-3">
                <Button asChild className="min-h-11 bg-white text-[#102b40] hover:bg-slate-100">
                  <a href={iosAppUrl}>
                    <Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />
                    Get the iOS app
                  </a>
                </Button>
                <Button asChild className="min-h-11 border border-white/35 bg-transparent text-white hover:bg-white/10">
                  <a href={androidRelease.url} download={androidRelease.filename}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Download Android APK
                  </a>
                </Button>
              </nav>
              <p className="mt-3 text-sm text-slate-300">
                Free offline apps for iPhone, iPad, and Android.{' '}
                <Link to="/support#android-install" className="underline underline-offset-4 hover:text-white">
                  Android installation help
                </Link>
              </p>
              <a
                href="https://github.com/bvolpato/far-aim-online"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#a5d5e9] underline decoration-white/35 underline-offset-4 hover:text-white hover:decoration-white"
              >
                <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                Open-source project · pull requests welcome
              </a>
            </div>

            <aside
              aria-label="Quick reference"
              className="hidden overflow-hidden rounded-2xl border border-white/20 bg-white/[0.04] lg:block"
            >
              <div className="flex items-center justify-between border-b border-white/15 px-6 py-5">
                <p className="home-eyebrow text-[#a5d5e9]">QUICK REFERENCE</p>
                <BookOpen className="h-5 w-5 text-[#a5d5e9]" aria-hidden="true" />
              </div>
              {[
                {
                  to: '/far/61',
                  code: 'PART 61',
                  title: 'Pilot certification',
                  subtitle: 'Certificates, ratings, and currency',
                },
                {
                  to: '/far/91',
                  code: 'PART 91',
                  title: 'Flight operations',
                  subtitle: 'General operating and flight rules',
                },
                {
                  to: '/aim/4',
                  code: 'AIM 4',
                  title: 'Air traffic control',
                  subtitle: 'Communication and airport operations',
                },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5 transition-colors last:border-0 hover:bg-white/10"
                >
                  <div>
                    <p className="mb-1 font-mono text-xs text-[#a5d5e9]">{item.code}</p>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.subtitle}</p>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-[#a5d5e9] transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </aside>
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          {recentItems.length > 0 && (
            <section aria-labelledby="continue-heading">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 id="continue-heading" className="text-base font-semibold">
                  Continue reading
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {recentItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="home-recent group flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
                  >
                    <Badge variant={item.type}>{item.type.toUpperCase()}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                      {item.title}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            <section aria-labelledby="library-heading">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="home-eyebrow text-muted-foreground">LOOK IT UP</p>
                  <h2 id="library-heading" className="mt-2 text-2xl font-semibold tracking-tight">
                    Your reference library
                  </h2>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border bg-card">
                {references.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group flex items-start gap-4 border-b p-5 transition-colors last:border-0 hover:bg-muted/60 sm:items-center"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold group-hover:text-primary">{item.title}</h3>
                      <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                        {item.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <ChevronRight
                      className="mt-3 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
              <Link
                to="/far"
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Browse Regulations <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>

            <section aria-labelledby="study-heading">
              <p className="home-eyebrow text-muted-foreground">MAKE IT STICK</p>
              <h2 id="study-heading" className="mb-5 mt-2 text-2xl font-semibold tracking-tight">
                A little study, every day
              </h2>
              <div className="home-study-card rounded-2xl border p-6">
                <GraduationCap className="mb-4 h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold">Study for your next certificate</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Follow one of {studyPaths.length} study paths, save references, and keep your
                  notes together.
                </p>
                <Button asChild className="mt-5 gap-2">
                  <Link to="/study">
                    Start Studying <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  {
                    to: '/quizzes',
                    title: 'Practice Quizzes',
                    detail: `${totalQuestions} questions`,
                    icon: Brain,
                  },
                  {
                    to: '/flashcards',
                    title: 'Flashcards',
                    detail: `${totalCards} cards`,
                    icon: Layers,
                  },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
                  >
                    <item.icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold group-hover:text-primary">{item.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section
            aria-labelledby="sources-heading"
            className="flex flex-col gap-5 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 id="sources-heading" className="text-sm font-semibold">
                Know your sources
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Bundled content dates, with publication details and official source links.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                {sources
                  .filter((source) => ['far', 'aim', 'pcg', 'ac'].includes(source.id))
                  .map((source) => (
                    <span key={source.id}>
                      <span className="font-semibold text-foreground">
                        {source.id.toUpperCase()}
                      </span>{' '}
                      <time dateTime={source.lastUpdated}>{source.lastUpdated}</time>
                    </span>
                  ))}
              </div>
            </div>
            <Link
              to="/updates"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Source details &amp; updates <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
