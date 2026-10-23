import { expect, test, type Page } from '@playwright/test';

async function holdPageChunk(page: Page, pattern: string) {
  let release!: () => void;
  let markRequested!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });

  await page.route(pattern, async (route) => {
    markRequested();
    await blocked;
    await route.continue();
  });

  return { requested, release };
}

test('keeps global search input disabled until SearchPage hydration completes', async ({ page }) => {
  const chunk = await holdPageChunk(page, '**/assets/SearchPage-*.js');

  try {
    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    await chunk.requested;

    const input = page.getByLabel('Search FAR/AIM content');
    await expect(input).toBeDisabled();

    chunk.release();
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await input.fill('airspace');
    await expect(page.getByText(/results? for "airspace"/)).toBeVisible();
    await expect(page.locator('main a.block[href*="highlight="]').first()).toBeVisible();
  } finally {
    chunk.release();
  }
});

test('focuses global search after client-side navigation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const headerSearch = page.getByLabel('Search regulations and terms');
  await headerSearch.fill('airspace');
  await headerSearch.press('Enter');

  const searchInput = page.getByLabel('Search FAR/AIM content');
  await expect(page).toHaveURL(/\/search\?q=airspace$/);
  await expect(searchInput).toHaveValue('airspace');
  await expect(searchInput).toBeFocused();
});

test('keeps FAR index search input disabled until FARPage hydration completes', async ({ page }) => {
  const chunk = await holdPageChunk(page, '**/assets/FARPage-*.js');

  try {
    await page.goto('/far', { waitUntil: 'domcontentloaded' });
    await chunk.requested;

    const input = page.getByPlaceholder('Search parts by number, title, or content...');
    await expect(input).toBeDisabled();

    chunk.release();
    await expect(input).toBeEnabled();
    await input.fill('private pilot');
    await expect(page.getByText(/Found \d+ parts? matching "private pilot"/)).toBeVisible();
    await expect(page.locator('a[href^="/far/61"]').first()).toBeVisible();
  } finally {
    chunk.release();
  }
});
