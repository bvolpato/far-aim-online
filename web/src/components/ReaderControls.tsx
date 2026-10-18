import { AlignJustify, ChevronUp, Minus, Plus, RotateCcw, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReaderDensity, useReaderPreferences } from '@/hooks/useReaderPreferences';
import { useEffect, useRef, useState } from 'react';

type ReaderControlsState = ReturnType<typeof useReaderPreferences>;

const densityOptions: { value: ReaderDensity; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'comfortable', label: 'Comfort' },
];

export function ReaderControls({
  state,
  className,
}: {
  state: ReaderControlsState;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Monitor scroll for Scroll-to-Top visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle clicking outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      ref={containerRef}
      className={cn('fixed bottom-6 right-6 z-40 flex flex-col items-center gap-2', className)}
      aria-label="Reader tools"
    >
      {/* Scroll to Top Button */}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={scrollToTop}
        className={cn(
          'h-11 w-11 rounded-full border border-border shadow-md transition-all duration-300 bg-card hover:bg-accent text-foreground hover:scale-105 active:scale-95',
          showScrollTop ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-75 pointer-events-none'
        )}
        aria-label="Scroll to top"
      >
        <ChevronUp className="h-5 w-5" />
      </Button>

      {/* Popover Settings Panel */}
      {isOpen && (
        <div
          className="absolute bottom-24 right-0 w-72 sm:w-80 rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md animate-fade-in flex flex-col gap-4 text-foreground"
          role="dialog"
          aria-label="Reader settings"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Type className="h-4 w-4 text-primary" />
              <span>Reader Settings</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-foreground"
              onClick={state.reset}
              aria-label="Reset reader controls"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Font Size controls */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Text Size</span>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={state.decreaseFont}
                disabled={!state.canDecreaseFont}
                aria-label="Decrease reader text size"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-foreground">
                {Math.round(state.fontScale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={state.increaseFont}
                disabled={!state.canIncreaseFont}
                aria-label="Increase reader text size"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Density controls */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Spacing / Density</span>
            <div className="flex items-center rounded-xl border border-border bg-background p-1" aria-label="Reader density">
              <AlignJustify className="mx-2 h-4 w-4 text-muted-foreground shrink-0" />
              <div className="grid grid-cols-3 gap-1 w-full">
                {densityOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={state.preferences.density === option.value ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-11 text-xs px-1',
                      state.preferences.density === option.value && 'bg-accent font-semibold text-foreground'
                    )}
                    onClick={() => state.setDensity(option.value)}
                    aria-pressed={state.preferences.density === option.value}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aa Settings Toggle Button */}
      <Button
        type="button"
        variant="default"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'h-12 w-12 rounded-full shadow-lg border border-border flex items-center justify-center font-bold text-base transition-all duration-200 hover:scale-105 active:scale-95',
          isOpen ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent'
        )}
        aria-label="Reader preferences"
        aria-expanded={isOpen}
      >
        Aa
      </Button>
    </div>
  );
}
