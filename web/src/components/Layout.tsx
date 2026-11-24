import { ReactNode, useState, useEffect, useRef, type RefObject } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  BookOpen,
  FileText,
  Search,
  Menu,
  X,
  Book,
  GraduationCap,
  ClipboardList,
  ChevronDown,
  Bookmark,
  Download,
  Smartphone,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useStudyMarkStats } from '@/hooks/useStudyMarks';
import { AnalyticsPreferences } from './AnalyticsPreferences';
import { androidRelease, iosAppUrl } from '@/lib/mobileApps';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', label: 'Home', shortLabel: 'Home', icon: Home, exact: true },
  { path: '/far', label: 'FAR', shortLabel: 'FAR', icon: FileText },
  { path: '/aim', label: 'AIM', shortLabel: 'AIM', icon: BookOpen },
  { path: '/glossary', label: 'Glossary', shortLabel: 'Glossary', icon: Book },
  { path: '/advisory-circulars', label: 'Advisory Circulars', shortLabel: 'ACs', icon: ClipboardList },
  { path: '/study', label: 'Study', shortLabel: 'Study', icon: GraduationCap },
];

function SharedIconSprite() {
  return (
    <svg aria-hidden="true" className="hidden" width="0" height="0">
      <defs>
        <symbol id="sm-bm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </symbol>
        <symbol id="sm-nt" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
          <path d="M15 3v4a2 2 0 0 0 2 2h4" />
        </symbol>
        <symbol id="sm-hl" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11-6 6v3h9l3-3" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </symbol>
        <symbol id="sm-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </symbol>
        <symbol id="sm-sh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
          <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
        </symbol>
        <symbol id="sm-tr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </symbol>
        <symbol id="sm-lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
          <line x1="8" x2="16" y1="12" y2="12" />
        </symbol>
      </defs>
    </svg>
  );
}

function HeaderSearchForm({
  inputRef,
  onSubmitted,
  placeholder,
  showShortcut = false,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  onSubmitted?: () => void;
  placeholder: string;
  showShortcut?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      onSubmitted?.();
    }
  };

  return (
    <form action="/search" method="get" onSubmit={handleSearch} className="w-full relative group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        aria-label="Search regulations and terms"
        name="q"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={placeholder}
        className={showShortcut ? 'pl-10 pr-12 rounded-xl border-none bg-secondary' : 'pl-10 rounded-xl border-none bg-secondary'}
      />
      {showShortcut && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 pointer-events-none">
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground bg-muted/70 rounded border border-border">
            ⌘K
          </kbd>
        </div>
      )}
    </form>
  );
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const navigate = useNavigate();
  const stats = useStudyMarkStats();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tabletNavigationOpen, setTabletNavigationOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setTabletNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncOnline = () => setIsOffline(!navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  // Global search shortcut (⌘K or /) and Escape dismissal for nav menus
  useEffect(() => {
    const focusOrNavigateSearch = () => {
      if (pathname === '/search') {
        const pageInput = document.querySelector('input[type="search"], input[name="q"]') as HTMLInputElement | null;
        pageInput?.focus();
      } else if (searchInputRef.current && searchInputRef.current.offsetParent !== null) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      } else {
        navigate('/search');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setTabletNavigationOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditing = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusOrNavigateSearch();
      } else if (e.key === '/' && !isEditing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        focusOrNavigateSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, navigate]);

  const isActive = (item: typeof navItems[0]) => {
    if (item.exact) return pathname === item.path;
    return pathname.startsWith(item.path);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SharedIconSprite />
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-lg bg-background px-4 py-3 text-foreground shadow-lg focus:translate-y-0"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link to="/" aria-label="FAR/AIM Online Reference & study home" className="flex items-center gap-2 shrink-0 sm:gap-3">
              <img src="/app-icon.svg" alt="" width="40" height="40" className="h-10 w-10 shrink-0 rounded-xl" />
              <div>
                <span className="text-base font-bold tracking-tight text-foreground sm:text-xl">FAR/AIM Online</span>
                <p className="hidden text-xs text-muted-foreground sm:block">Free reference &amp; study</p>
              </div>
            </Link>

            {/* Desktop Search Bar */}
            {pathname !== '/search' && (
              <div className="hidden md:flex flex-1 max-w-md mx-4">
                <HeaderSearchForm
                  inputRef={searchInputRef}
                  placeholder="Search regulations, terms..."
                  showShortcut
                />
              </div>
            )}

            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              {/* Desktop Navigation */}
              <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary navigation">
                {navItems.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.shortLabel}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Tablet navigation overflow */}
              <div className="relative hidden md:block xl:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setTabletNavigationOpen((open) => !open)}
                  aria-label={tabletNavigationOpen ? 'Navigate: close page navigation' : 'Navigate: open page navigation'}
                  aria-expanded={tabletNavigationOpen}
                  aria-controls="tablet-navigation-menu"
                  title={tabletNavigationOpen ? 'Close page navigation' : 'Open page navigation'}
                  className="gap-2"
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                  <span>Navigate</span>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                {tabletNavigationOpen && (
                  <div
                    id="tablet-navigation-menu"
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border bg-background p-2 shadow-xl"
                  >
                    <nav aria-label="Page navigation" className="space-y-1">
                      {navItems.map((item) => {
                        const active = isActive(item);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setTabletNavigationOpen(false)}
                            title={item.label}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                )}
              </div>

              {/* Saved References quick access */}
              <Link
                to="/study#saved-study-marks"
                title={stats.saved > 0 ? `${stats.saved} saved reference${stats.saved !== 1 ? 's' : ''}` : 'Saved references'}
                aria-label={stats.saved > 0 ? `${stats.saved} saved references` : 'Saved references'}
                className="relative hidden sm:flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Bookmark className={cn('h-4 w-4', stats.saved > 0 && 'text-primary fill-primary/20')} />
                {stats.saved > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {stats.saved}
                  </span>
                )}
              </Link>

              <ThemeToggle />

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background max-h-[calc(100vh-4rem)] overflow-y-auto animate-fade-in">
            <div className="p-4 border-b">
              <HeaderSearchForm
                placeholder="Search..."
                onSubmitted={() => setMobileMenuOpen(false)}
              />
            </div>
            <nav aria-label="Mobile navigation" className="px-4 py-3 space-y-1">
              {stats.saved > 0 && (
                <Link
                  to="/study#saved-study-marks"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-foreground bg-primary/5 border border-primary/20 mb-2"
                >
                  <span className="flex items-center gap-3">
                    <Bookmark className="w-5 h-5 text-primary fill-primary/20" />
                    <span>Saved References</span>
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground font-semibold">
                    {stats.saved}
                  </span>
                </Link>
              )}
              {navItems.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="mt-3 border-t pt-3">
                <a href={iosAppUrl} className="flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium hover:bg-accent">
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                  Get the iOS app
                </a>
                <a href={androidRelease.url} download={androidRelease.filename} className="flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium hover:bg-accent">
                  <Download className="h-5 w-5" aria-hidden="true" />
                  Download Android APK
                </a>
              </div>
            </nav>
          </div>
        )}
      </header>

      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
        >
          You are offline. Cached regulations, manuals, and study materials remain available.
        </div>
      )}

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-background mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} FAR/AIM Online. Free and open source. For educational purposes.
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <AnalyticsPreferences />
              <a href={iosAppUrl} className="hover:text-primary transition-colors">
                iPhone &amp; iPad app
              </a>
              <a href={androidRelease.url} download={androidRelease.filename} className="hover:text-primary transition-colors">
                Android APK
              </a>
              <Link to="/privacy" className="hover:text-primary transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-primary transition-colors">
                Terms
              </Link>
              <Link to="/support" className="hover:text-primary transition-colors">
                Support
              </Link>
              <a
                href="https://github.com/bvolpato/far-aim-online"
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary transition-colors"
              >
                Contribute on GitHub
              </a>
              <span>Content based on FAA publications</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
