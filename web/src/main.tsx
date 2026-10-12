import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { HelmetProvider } from 'react-helmet-async'
import { preloadRoute } from './routes';
import { loadRouteData, RouteDataContext } from './context/route-data';
import App from './App.tsx'
import './index.css'

async function start() {
  const root = document.getElementById('root')!;
  const initialPath = root.dataset.prerendered;
  const hasStaticPage = initialPath === window.location.pathname.replace(/\/$/, '') ||
    (initialPath === '/' && window.location.pathname === '/');

  // Keep the rendered page on screen while its interactive code and data load.
  const [, routeData] = await Promise.all([
    hasStaticPage ? preloadRoute(window.location.pathname) : Promise.resolve(),
    hasStaticPage ? loadRouteData(window.location.pathname) : Promise.resolve({}),
  ]);
  const app = (
    <React.StrictMode>
      <HelmetProvider>
        <BrowserRouter>
          <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
            <RouteDataContext.Provider value={routeData}>
              <App initialPath={hasStaticPage ? initialPath : undefined} />
            </RouteDataContext.Provider>
          </ThemeProvider>
        </BrowserRouter>
      </HelmetProvider>
    </React.StrictMode>
  );

  if (hasStaticPage) ReactDOM.hydrateRoot(root, app);
  else ReactDOM.createRoot(root).render(app);
}

void start().catch((error: unknown) => {
  console.error('Failed to initialize page', error);
  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert');
  notice.className = 'fixed bottom-4 left-4 right-4 z-[100] rounded-lg border bg-background p-4 text-foreground shadow-lg';
  notice.append('Interactive tools could not load. ');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'font-semibold underline';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => window.location.reload());
  notice.append(retry);
  document.body.append(notice);
});
