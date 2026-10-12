import { Component, Suspense, startTransition, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { Layout } from './components/Layout';
import { Button } from './components/ui/button';
import { appRoutes } from './routes';

export function RouteLoading() {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 py-16 text-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">Loading page...</p>
    </div>
  );
}

interface RouteErrorFallbackProps {
  onRetry?: () => void;
}

export function RouteErrorFallback({ onRetry = () => window.location.reload() }: RouteErrorFallbackProps) {
  return (
    <section
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 py-16 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="rounded-full bg-destructive/10 p-3 text-destructive">
        <RefreshCw className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Page unavailable</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This page did not finish loading. Retry or return home to continue studying.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry loading
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/">Return home</Link>
        </Button>
      </div>
    </section>
  );
}

interface RouteErrorBoundaryState {
  hasError: boolean;
}

export class RouteErrorBoundary extends Component<{ children: ReactNode }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route failed to render', error, errorInfo);
  }

  private handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <RouteErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

function App({ initialPath }: { initialPath?: string }) {
  const location = useLocation();
  const [hydrated, setHydrated] = useState(!initialPath);

  useEffect(() => {
    startTransition(() => setHydrated(true));
  }, []);

  // Static HTML has no query or hash; apply them after the matching tree hydrates.
  const routeLocation = hydrated
    ? location
    : { ...location, search: '', hash: '', key: 'default' };

  return (
    <Layout>
      <RouteErrorBoundary key={location.key}>
        <Suspense fallback={<RouteLoading />}>
          <Routes location={routeLocation}>
            {appRoutes.map(({ path, Component: Page }) => (
              <Route key={path} path={path} element={<Page />} />
            ))}
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </Layout>
  );
}

export default App;
