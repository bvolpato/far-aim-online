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

test('keeps reader preferences inert until FAR hydration completes', async ({ page }) => {
  const chunk = await holdPageChunk(page, '**/assets/FARPage-*.js');

  try {
    await page.goto('/far/61', { waitUntil: 'domcontentloaded' });
    await chunk.requested;

    const preferencesToggle = page.getByRole('button', { name: 'Reader preferences' });
    await expect(preferencesToggle).toBeDisabled();

    chunk.release();
    await expect(preferencesToggle).toBeEnabled();
    await preferencesToggle.click();

    const dialog = page.getByRole('dialog', { name: 'Reader settings' });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Increase reader text size' }).click();
    await expect(dialog).toContainText('110%');
    await page.getByRole('button', { name: 'Comfort' }).click();
    await expect(page.getByRole('button', { name: 'Comfort' })).toHaveAttribute('aria-pressed', 'true');

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Reader preferences' }).click();
    await expect(page.getByRole('dialog', { name: 'Reader settings' })).toContainText('110%');
    await expect(page.getByRole('button', { name: 'Comfort' })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    chunk.release();
  }
});

test('keeps flashcard controls inert until deck hydration completes', async ({ page }) => {
  const chunk = await holdPageChunk(page, '**/assets/FlashcardDeckPage-*.js');

  try {
    await page.goto('/flashcards/far-definitions', { waitUntil: 'domcontentloaded' });
    await chunk.requested;

    const flashcard = page.locator('.flashcard');
    const nextButton = page.getByRole('button', { name: 'Next' });
    const gotItButton = page.getByRole('button', { name: 'Got It!' });

    await expect(page.getByRole('heading', { name: 'Aircraft' })).toBeVisible();
    await expect(flashcard).toHaveAccessibleName('Show definition for Aircraft');
    await expect(flashcard).toHaveAttribute('aria-disabled', 'true');
    await expect(flashcard).toHaveAttribute('tabindex', '-1');
    await expect(nextButton).toBeDisabled();
    await expect(gotItButton).toBeDisabled();

    chunk.release();
    await expect(flashcard).toBeEnabled();
    await expect(flashcard).toHaveAttribute('tabindex', '0');
    await expect(nextButton).toBeEnabled();
    await expect(gotItButton).toBeEnabled();

    await flashcard.press('Enter');
    await expect(flashcard).toHaveAttribute('aria-pressed', 'true');
    await flashcard.click();
    await expect(flashcard).toHaveAttribute('aria-pressed', 'false');

    await gotItButton.click();
    await expect(page.getByText('Card 2 of 50')).toBeVisible();
    await page.locator('.flashcard').press('ArrowRight');
    await expect(page.getByText('Card 3 of 50')).toBeVisible();
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByText('Card 2 of 50')).toBeVisible();
  } finally {
    chunk.release();
  }
});
