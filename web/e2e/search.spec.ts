import { expect, test } from '@playwright/test';

test.describe('global search', () => {
  test('defers search downloads until a query, then loads excerpts only for visible results', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/search/') && request.url().endsWith('.json')) requests.push(request.url());
    });
    await page.goto('/search');
    await expect(page.getByText('Popular Topics')).toBeVisible();
    expect(requests).toEqual([]);

    await page.getByLabel('Search FAR/AIM content').fill('airspace');
    const more = page.getByRole('button', { name: 'Show more results' });
    await expect(more).toBeEnabled();
    await expect(page.locator('main a.block[href*="highlight="]')).toHaveCount(10);
    expect(requests.filter(url => url.includes('/content/')).length).toBeLessThanOrEqual(10);
    expect(requests.some(url => url.includes('/search/far/'))).toBe(false);

    await more.click();
    await expect(page.locator('main a.block[href*="highlight="]')).toHaveCount(20);
  });

  test('loads URL query, returns results, and opens a result', async ({ page }) => {
    await page.goto('/search?q=airspace');

    await expect(page).toHaveTitle(/Search/);
    await expect(page.getByLabel('Search FAR/AIM content')).toHaveValue('airspace');
    await expect(page.getByText(/results? for "airspace"/)).toBeVisible();

    const result = page.locator('main a.block[href*="/far"], main a.block[href*="/aim"], main a.block[href*="/glossary"]').first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/(far|aim|glossary)/);
  });

  test('filters result categories and clears search', async ({ page }) => {
    await page.goto('/search');

    await page.getByLabel('Search FAR/AIM content').fill('pilot');
    await expect(page.getByText(/results? for "pilot"/)).toBeVisible();

    await page.getByRole('button', { name: 'AIM' }).click();
    await expect(page.getByText(/results? for "pilot"/)).toBeVisible();

    await page.getByLabel('Clear search').click();
    await expect(page.getByLabel('Search FAR/AIM content')).toHaveValue('');
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByText('Popular Topics')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Search FAR/AIM content')).toHaveValue('');
  });

  test('shows empty state for no-match search', async ({ page }) => {
    await page.goto('/search');

    await page.getByLabel('Search FAR/AIM content').fill('zzznomatch12345');
    await expect(page.getByText('No results found. Try different keywords.')).toBeVisible();
  });

  test('finds content stored in structured AIM tables', async ({ page }) => {
    await page.goto('/search?q=SSV%20Designator');

    await expect(page.getByRole('link', { name: /1-1-8 - NAVAID Service Volumes/ })).toBeVisible();
  });

  test('finds bundled flashcards and opens their deck', async ({ page }) => {
    await page.goto('/search?q=Private%20Pilot%20Minimum%20Age');

    const result = page.getByRole('link', { name: /Private Pilot Minimum Age/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/flashcards\/far-part61-certification/);
  });

  test('opens the matched glossary term from search', async ({ page }) => {
    await page.goto('/search?q=MIDDLE%20MARKER');

    await page.locator('a[href^="/glossary"][href$="#MIDDLE%20MARKER"]').click();
    await expect(page).toHaveURL(/\/glossary\?highlight=MIDDLE%20MARKER#MIDDLE%20MARKER/);
    await expect(page.locator('[id="MIDDLE MARKER"]')).toBeInViewport();
  });

  test('shows a retryable error when search indexes fail to load', async ({ page }) => {
    await page.route('**/search/**/*.json', (route) => route.abort());
    await page.goto('/search?q=airspace');

    await expect(page.getByRole('alert')).toContainText('Search is temporarily unavailable');
    await expect(page.getByRole('button', { name: 'Retry search' })).toBeVisible();

    await page.unroute('**/search/**/*.json');
    await page.getByRole('button', { name: 'Retry search' }).click();
    await expect(page.getByText(/results? for "airspace"/)).toBeVisible();
  });

  test('does not restore stale results when a pending search is cleared', async ({ page }) => {
    let pending = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/search/**/*.json', async route => {
      pending++;
      await gate;
      await route.continue();
    });
    await page.goto('/search?q=airspace');
    await expect.poll(() => pending).toBeGreaterThan(0);
    await page.getByLabel('Clear search').click();
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Popular Topics')).toBeVisible();
    await expect(page.locator('main a.block[href*="highlight="]')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
