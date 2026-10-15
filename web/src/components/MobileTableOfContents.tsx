import { useState, useMemo, useEffect, useRef } from 'react';
import { List, X, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface TocItem {
  id: string;
  label: string;
  title?: string;
  isAppendix?: boolean;
}

interface MobileTableOfContentsProps {
  title: string;
  items: TocItem[];
  activeId?: string;
}

export function MobileTableOfContents({
  title,
  items,
  activeId,
}: MobileTableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const drawerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // Focus the filter input on open
      setTimeout(() => inputRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!filter.trim()) return items;
    const query = filter.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        (item.title && item.title.toLowerCase().includes(query))
    );
  }, [items, filter]);

  const activeItem = useMemo(() => {
    return items.find((item) => item.id === activeId);
  }, [items, activeId]);

  const handleSelect = (id: string) => {
    setIsOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="lg:hidden mb-6">
      <Button
        variant="outline"
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full h-auto py-3.5 px-4 rounded-xl flex items-center justify-between border-border bg-card text-foreground shadow-sm hover:bg-accent"
        aria-label="Open table of contents drawer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <List className="w-4 h-4 text-primary" />
          <span>{title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-normal">
            {items.length}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[150px]">
          {activeItem ? activeItem.label : 'Jump to section'}
          <ChevronRight className="w-4 h-4 shrink-0" />
        </span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sheet */}
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative ml-auto flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-2xl animate-slide-left z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <List className="w-4 h-4 text-primary" />
                  {title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {items.length} references
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                aria-label="Close table of contents"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Filter Search */}
            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={inputRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter sections..."
                  className="pl-9 h-9 text-sm rounded-lg"
                />
                {filter && (
                  <button
                    type="button"
                    onClick={() => setFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No sections match "{filter}"
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isActive = activeId === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelect(item.id);
                      }}
                      className={cn(
                        'block w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('font-medium', isActive ? 'text-primary' : 'text-foreground')}>
                          {item.label}
                        </span>
                        {item.isAppendix && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Appendix
                          </span>
                        )}
                      </div>
                      {item.title && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.title}
                        </p>
                      )}
                    </a>
                  );
                })
              )}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
