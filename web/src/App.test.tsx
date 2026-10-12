import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RouteErrorFallback, RouteLoading } from './App';

describe('route resilience UI', () => {
  it('shows a visible loading status for lazy routes', () => {
    const html = renderToStaticMarkup(<RouteLoading />);

    expect(html).toContain('role="status"');
    expect(html).toContain('Loading page...');
  });

  it('offers retry and home recovery when a route fails', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/study">
        <RouteErrorFallback />
      </StaticRouter>
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry loading');
    expect(html).toContain('Return home');
  });
});
