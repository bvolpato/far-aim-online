import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { RouteDataContext, type RouteData } from './context/route-data';
import { preloadRoute } from './routes';

export async function render(pathname: string, data: RouteData) {
  await preloadRoute(pathname);
  const html = renderToString(
    <HelmetProvider>
      <StaticRouter location={pathname}>
        <ThemeProvider>
          <RouteDataContext.Provider value={data}>
            <App />
          </RouteDataContext.Provider>
        </ThemeProvider>
      </StaticRouter>
    </HelmetProvider>,
  );

  // React 19 hoists Helmet metadata and resource hints out of the app tree.
  const head: string[] = [];
  const body = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>/g, (tag) => {
    head.push(tag);
    return '';
  });
  return { body, head: head.join('') };
}
