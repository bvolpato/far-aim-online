import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ImageOff, ZoomIn, X } from 'lucide-react';
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

function FigureLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    closeButtonRef.current?.focus();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close figure"
        onClick={onClose}
        className="absolute right-4 top-4 text-white transition-colors hover:text-gray-300"
      >
        <X className="h-8 w-8" />
      </button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-full object-contain" />
    </div>
  );
}

export function ReferenceFigures({
  figures,
  assetRoot,
  query = '',
  fallbackLabel = 'Figure',
}: ReferenceFiguresProps) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const root = assetRoot.replace(/\/$/, '');

  return (
    <div className="space-y-6">
      {lightbox && (
        <FigureLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
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
                <p className="text-sm font-medium text-foreground">Figure unavailable offline</p>
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
                onClick={() => setLightbox({ src: imagePath, alt: figure.alt?.trim() || label })}
                aria-label={`Open ${label}`}
              >
                <img
                  src={imagePath}
                  alt={figure.alt?.trim() || label}
                  className="max-h-[70vh] w-full object-contain"
                  loading="lazy"
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
