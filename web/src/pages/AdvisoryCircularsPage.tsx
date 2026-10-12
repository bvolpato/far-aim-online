import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  FileDown,
  Search,
} from 'lucide-react';
import { getAdvisoryCirculars, type AdvisoryCircular } from '../data';
import {
  sortAdvisoryCirculars,
  type AdvisoryCircularSort,
} from '../lib/advisoryCirculars';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StudyMarkTools } from '@/components/StudyMarkTools';

export function AdvisoryCircularsPage() {
  const [advisoryCirculars, setAdvisoryCirculars] = useState<AdvisoryCircular[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState<AdvisoryCircularSort>('newest');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    void getAdvisoryCirculars()
      .then((items) => {
        if (active) setAdvisoryCirculars(items);
      })
      .catch((error) => {
        console.error('Failed to load advisory circulars', error);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(advisoryCirculars.map((ac) => ac.category))).sort()],
    [advisoryCirculars],
  );
  const displayedCategories = useMemo(() => {
    if (category === 'All') return categories;
    return ['All', category, ...categories.filter((item) => item !== 'All' && item !== category)];
  }, [categories, category]);

  const filteredCirculars = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = advisoryCirculars.filter((ac) => {
      const matchesCategory = category === 'All' || ac.category === category;
      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;

      return [
        ac.number,
        ac.title,
        ac.summary,
        ac.category,
        ac.office,
        ac.status,
        ac.replaces || '',
        ...ac.relatedCfr,
        ...ac.tags,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });

    return sortAdvisoryCirculars(matches, sort);
  }, [advisoryCirculars, category, query, sort]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
      <Helmet>
        <title>FAA Advisory Circulars | FAR/AIM Online</title>
        <meta
          name="description"
          content="Browse current FAA Advisory Circulars with official source links and searchable offline text when available."
        />
      </Helmet>

      <section className="mb-8 rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-3 py-1 text-sm font-medium text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
              <ClipboardList className="h-4 w-4" />
              FAA guidance library
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Advisory Circulars</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                {advisoryCirculars.length} current FAA Advisory Circular records with official FAA pages and PDF links where published.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xl font-semibold text-foreground">{advisoryCirculars.length}</p>
              <p className="text-muted-foreground">ACs</p>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xl font-semibold text-foreground">{categories.length - 1}</p>
              <p className="text-muted-foreground">topics</p>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xl font-semibold text-foreground">FAA</p>
              <p className="text-muted-foreground">source</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search forms, records, service difficulty, airworthiness..."
              className="pl-9"
            />
          </div>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="ac-sort" className="sr-only">Sort advisory circulars</label>
            <select
              id="ac-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as AdvisoryCircularSort)}
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="newest">Newest issued</option>
              <option value="oldest">Oldest issued</option>
              <option value="number">AC number</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div
            className={`flex min-w-0 flex-1 flex-wrap gap-2 overflow-hidden ${filtersExpanded ? '' : 'max-h-9'}`}
          >
            {displayedCategories.map((item) => (
              <Button
                key={item}
                type="button"
                variant={category === item ? 'default' : 'secondary'}
                size="sm"
                className="shrink-0"
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded((expanded) => !expanded)}
          >
            {filtersExpanded ? (
              <ChevronUp className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1 h-4 w-4" />
            )}
            {filtersExpanded ? 'Less' : 'More filters'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredCirculars.map((ac) => (
          <Card key={ac.id} id={ac.id} className="scroll-mt-24">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">AC {ac.number}</Badge>
                    <Badge variant="outline">{ac.status}</Badge>
                    {ac.contentStatus === 'partial' && (
                      <Badge variant="outline">Partial offline text</Badge>
                    )}
                    {ac.contentStatus === 'unavailable' && (
                      <Badge variant="outline">Official source only</Badge>
                    )}
                    <span className="text-sm text-muted-foreground">Issued {ac.issued}</span>
                    {ac.replaces && (
                      <span className="text-sm text-muted-foreground">replaces AC {ac.replaces}</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {ac.contentPath ? (
                        <Link
                          to={`/advisory-circulars/${ac.id}`}
                          className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {ac.title}
                        </Link>
                      ) : (
                        ac.title
                      )}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ac.category} · {ac.office}</p>
                  </div>
                  <p className="text-sm leading-6 text-foreground/85">{ac.summary}</p>
                  <StudyMarkTools
                    compact
                    type="ac"
                    reference={`AC ${ac.number}`}
                    title={ac.title}
                    path={ac.contentPath ? `/advisory-circulars/${ac.id}` : `/advisory-circulars#${ac.id}`}
                  />
                  <div className="flex flex-wrap gap-2">
                    {ac.relatedCfr.map((reference) => (
                      <Badge key={reference} variant="outline">{reference}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={ac.documentUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      FAA page
                    </a>
                  </Button>
                  {ac.pdfUrl && (
                    <Button asChild variant={ac.contentPath ? 'outline' : 'default'} size="sm">
                      <a href={ac.pdfUrl} target="_blank" rel="noreferrer">
                        <FileDown className="mr-2 h-4 w-4" />
                        PDF
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
