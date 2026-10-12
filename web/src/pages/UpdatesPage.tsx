import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Database,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSourceStatus, type SourceChangeWatch, type SourceStatusItem } from '../data';

function sourceAccent(source: SourceStatusItem) {
  switch (source.id) {
    case 'far':
      return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200';
    case 'aim':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200';
    case 'pcg':
      return 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-200';
    case 'ac':
      return 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';
  }
}

function SourceLink({ source }: { source: SourceStatusItem }) {
  if (source.officialUrl.startsWith('/')) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to={source.officialUrl}>
          Open
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <a href={source.officialUrl} target="_blank" rel="noreferrer">
        Official source
        <ExternalLink className="ml-2 h-4 w-4" />
      </a>
    </Button>
  );
}

function changeWatchAccent(item: SourceChangeWatch) {
  switch (item.severity) {
    case 'new':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200';
    case 'workflow':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';
  }
}

function ChangeWatchLink({ item }: { item: SourceChangeWatch }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={item.link}>
        Review
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}

export function UpdatesPage() {
  const status = getSourceStatus();

  return (
    <div className="animate-fade-in">
      <Helmet>
        <title>Data Updates | FAR/AIM Online</title>
        <meta
          name="description"
          content="FAR/AIM Online data freshness, release notes, content coverage, and known limitations."
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <section className="border-b bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm font-medium text-foreground">
                <RefreshCw className="h-4 w-4 text-primary" />
                Data status
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground sm:text-4xl">Updates</h1>
                <p className="mt-2 text-muted-foreground">
                  Source dates, content coverage, release notes, and known limits for FAR/AIM Online.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border bg-background px-3 py-2">
                <p className="font-semibold text-foreground">{status.generatedAt}</p>
                <p className="text-muted-foreground">status date</p>
              </div>
              <div className="rounded-md border bg-background px-3 py-2">
                <p className="font-semibold text-foreground">v{status.appVersion}</p>
                <p className="text-muted-foreground">app version</p>
              </div>
              <div className="rounded-md border bg-background px-3 py-2 col-span-2 sm:col-span-1">
                <p className="font-semibold text-foreground">{status.sources.length}</p>
                <p className="text-muted-foreground">tracked sources</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Source Coverage</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {status.sources.map((source) => (
              <Card key={source.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Badge className={sourceAccent(source)} variant="outline">
                        {source.shortLabel}
                      </Badge>
                      <CardTitle className="mt-3 text-lg">{source.label}</CardTitle>
                    </div>
                    <Badge variant="secondary">{source.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground">Last updated</p>
                      <p className="font-semibold text-foreground">{source.lastUpdated}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground">Coverage</p>
                      <p className="font-semibold text-foreground">{source.coverage}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{source.source}</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {source.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <SourceLink source={source} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Change Watch</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {status.changeWatch.map((item) => (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Badge className={changeWatchAccent(item)} variant="outline">
                        {item.severity}
                      </Badge>
                      <CardTitle className="mt-3 text-lg">{item.title}</CardTitle>
                    </div>
                    <Badge variant="secondary">{item.date}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{item.summary}</p>
                  <div>
                    <p className="text-sm font-medium text-foreground">Affected references</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.affectedReferences.map((reference) => (
                        <Badge key={reference} variant="outline">
                          {reference}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Review actions</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {item.actions.map((action) => (
                        <li key={action} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ChangeWatchLink item={item} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold text-foreground">Release Notes</h2>
            </div>
            <div className="space-y-3">
              {status.releaseNotes.map((note) => (
                <Card key={`${note.date}-${note.title}`}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{note.date}</Badge>
                      <h3 className="font-semibold text-foreground">{note.title}</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {note.details.map((detail) => (
                        <li key={detail} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Known Limits</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {status.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Next Checks</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {status.nextChecks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
