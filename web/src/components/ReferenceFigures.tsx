import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Minus, Plus, RotateCcw, ZoomIn, X } from 'lucide-react';
import { HighlightText } from './HighlightText';

export interface ReferenceFigure {
  src: string;
  alt?: string;
  caption?: string;
  originalUrl?: string;
}

interface ReferenceFiguresProps {
  figures: ReferenceFigure[];
  assetRoot: string;
  query?: string;
  fallbackLabel?: string;
}

interface LightboxItem {
  src: string;
  alt: string;
  caption: string;
}

function FigureLightbox({
  items,
  initialIndex,
  onClose,
}: {
  items: LightboxItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  const current = items[index] ?? items[0];
  const canNavigate = items.length > 1;

  useEffect(() => {
    setZoom(1);
  }, [index]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight' && canNavigate) {
        setIndex((i) => (i + 1) % items.length);
      } else if (event.key === 'ArrowLeft' && canNavigate) {
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else if (event.key === '+' || event.key === '=') {
        setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))));
      } else if (event.key === '-') {
        setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))));
      } else if (event.key === '0') {
        setZoom(1);
      }
    };

    closeButtonRef.current?.focus();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, canNavigate, items.length]);

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-2 pb-3 text-white">
        <span className="text-xs text-white/80 truncate">
          {canNavigate ? `${index + 1} / ${items.length} · ` : ''}{current.caption}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))}
            disabled={zoom <= 1}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))))}
            disabled={zoom >= 3}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          {zoom > 1 && (
            <button
              type="button"
              aria-label="Reset zoom"
              onClick={() => setZoom(1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close figure"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-auto">
        {canNavigate && (
          <button
            type="button"
            aria-label="Previous figure"
            onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
            className="fixed left-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <img
          src={current.src}
          alt={current.alt}
          onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
          style={{ width: zoom === 1 ? undefined : `${zoom * 100}%` }}
          className={
            zoom === 1
              ? 'max-h-[82vh] max-w-full cursor-zoom-in object-contain bg-white rounded-md p-2'
              : 'max-w-none cursor-zoom-out bg-white rounded-md p-2'
          }
        />
        {canNavigate && (
          <button
            type="button"
            aria-label="Next figure"
            onClick={() => setIndex((i) => (i + 1) % items.length)}
            className="fixed right-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ReferenceFigures({
  figures,
  assetRoot,
  query = '',
  fallbackLabel = 'Figure',
}: ReferenceFiguresProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const root = assetRoot.replace(/\/$/, '');

  useEffect(() => {
    setFailedImages(new Set());
    setLightboxIndex(null);
  }, [figures]);

  const lightboxItems: LightboxItem[] = figures.map((figure, index) => {
    const label = figure.caption?.trim() || figure.alt?.trim() || `${fallbackLabel} ${index + 1}`;
    return {
      src: `${root}/${figure.src.replace(/^\//, '')}`,
      alt: figure.alt?.trim() || label,
      caption: label,
    };
  });

  return (
    <div className="space-y-6">
      {lightboxIndex !== null && (
        <FigureLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {figures.map((figure, index) => {
        const imagePath = `${root}/${figure.src.replace(/^\//, '')}`;
        const label = figure.caption?.trim() || figure.alt?.trim() || `${fallbackLabel} ${index + 1}`;
        const failed = failedImages.has(figure.src);

        return (
          <figure key={`${figure.src}-${index}`} className="space-y-2">
            {failed ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 p-6 text-center">
                <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Figure could not be loaded</p>
                {figure.originalUrl && (
                  <a
                    href={figure.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View official source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="group relative w-full overflow-hidden rounded-lg border border-border bg-white p-3 text-left transition-all hover:ring-2 hover:ring-sky-500"
                onClick={() => setLightboxIndex(index)}
                aria-label={`Open ${label}`}
              >
                <img
                  src={imagePath}
                  alt={figure.alt?.trim() || label}
                  className="max-h-[70vh] w-full object-contain"
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setFailedImages((current) => new Set(current).add(figure.src));
                  }}
                />
                <span className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            )}
            <figcaption className="text-center text-xs text-muted-foreground">
              <HighlightText text={label} query={query} />
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
