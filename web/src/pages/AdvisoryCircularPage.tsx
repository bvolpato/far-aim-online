import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileDown, FileSearch, Loader2, Search } from 'lucide-react';
import {
  getAdvisoryCircularContent,
  getAdvisoryCirculars,
  type AdvisoryCircular,
  type AdvisoryCircularContent,
} from '../data';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { FormattedContent } from '../components/FormattedContent';
import { StudyMarkTools } from '../components/StudyMarkTools';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AdvisoryCircularPage() {
  const { acId } = useParams();
  const [searchParams] = useSearchParams();
  const [advisoryCircular, setAdvisoryCircular] = useState<AdvisoryCircular>();
  const [content, setContent] = useState<AdvisoryCircularContent>();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(searchParams.get('highlight') || '');

  useEffect(() => {
    let active = true;
    void getAdvisoryCirculars()
      .then(async (items) => {
        const selected = items.find((item) => item.id === acId);
        if (!selected || !active) return;
        setAdvisoryCircular(selected);
        const loaded = await getAdvisoryCircularContent(selected);
        if (active) setContent(loaded);
      })
      .catch((error) => {
        console.error('Failed to load Advisory Circular content', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [acId]);

  const matchingPages = useMemo(() => {
    if (!content) return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return content.pages;
    return content.pages.filter((page) => page.text.toLowerCase().includes(normalizedQuery));
  }, [content, query]);

  useEffect(() => {
    if (!query || matchingPages.length === 0) return;
    document.getElementById(`page-${matchingPages[0].page}`)?.scrollIntoView({ behavior: 'smooth' });
  }, [matchingPages, query]);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center" aria-label="Loading Advisory Circular">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!advisoryCircular) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <FileSearch className="mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Advisory Circular not found</h1>
        <p className="mt-2 text-muted-foreground">
          This circular is not in the current catalog.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild variant="outline">
            <Link to="/advisory-circulars"><ArrowLeft className="mr-2 h-4 w-4" />AC library</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!content) {
    const contentError = advisoryCircular.contentError?.trim();
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <FileSearch className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          AC {advisoryCircular.number} · Offline text unavailable
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{advisoryCircular.title}</h1>
        <p className="mt-3 text-muted-foreground">
          {contentError || 'Offline text is unavailable for this circular. The official FAA source remains available.'}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{advisoryCircular.summary}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/advisory-circulars"><ArrowLeft className="mr-2 h-4 w-4" />AC library</Link>
          </Button>
          <Button asChild>
            <a href={advisoryCircular.documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />FAA page
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Helmet>
        <title>{`AC ${advisoryCircular.number} | FAR/AIM Online`}</title>
        <meta name="description" content={advisoryCircular.summary} />
        <link rel="canonical" href={`https://faraim.online/advisory-circulars/${advisoryCircular.id}`} />
      </Helmet>

      <Breadcrumbs
        className="mb-6 overflow-x-auto"
        items={[
          { label: 'Advisory Circulars', path: '/advisory-circulars' },
          { label: `AC ${advisoryCircular.number}` },
        ]}
      />

      <header className="border-b pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>AC {advisoryCircular.number}</Badge>
          <Badge variant="outline">{advisoryCircular.status}</Badge>
          <span className="text-sm text-muted-foreground">Issued {advisoryCircular.issued}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">{advisoryCircular.title}</h1>
        <p className="mt-3 max-w-4xl leading-7 text-muted-foreground">{advisoryCircular.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StudyMarkTools
            compact
            type="ac"
            reference={`AC ${advisoryCircular.number}`}
            title={advisoryCircular.title}
            path={`/advisory-circulars/${advisoryCircular.id}`}
          />
          <Button asChild variant="outline" size="sm">
            <a href={advisoryCircular.documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />FAA page
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={content.pdfUrl} target="_blank" rel="noreferrer">
              <FileDown className="mr-2 h-4 w-4" />Official PDF
            </a>
          </Button>
        </div>
      </header>

      <div className="sticky top-16 z-30 -mx-2 border-b bg-background/95 px-2 py-4 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              aria-label="Find in Advisory Circular"
              placeholder="Find in this Advisory Circular"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {query
              ? `${matchingPages.length} matching pages`
              : content.status === 'partial'
                ? `${content.extractedPageCount ?? content.pages.length} of ${content.pageCount} pages extracted · ${content.wordCount.toLocaleString()} words`
                : `${content.pageCount} pages · ${content.wordCount.toLocaleString()} words`}
          </span>
        </div>
      </div>

      {content.status === 'partial' && (
        <p role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Extracted text is incomplete for this PDF. Use Official PDF for omitted pages, figures, tables, and source formatting.
        </p>
      )}

      {matchingPages.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No pages match “{query}”.</p>
      ) : (
        <article className="divide-y">
          {matchingPages.map((page) => (
            <section key={page.page} id={`page-${page.page}`} className="scroll-mt-36 py-8">
              <div className="mb-4 text-xs font-semibold uppercase text-muted-foreground">Page {page.page}</div>
              <FormattedContent
                text={page.text}
                highlight={query}
                className="text-[1rem] leading-7 text-foreground/90"
              />
            </section>
          ))}
        </article>
      )}

      <footer className="border-t py-6 text-sm text-muted-foreground">
        Extracted from official FAA PDF on {content.fetched}. Consult official PDF when omitted pages, formatting, figures, or tables affect interpretation.
      </footer>
    </div>
  );
}
