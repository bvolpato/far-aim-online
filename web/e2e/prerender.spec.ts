import { expect, test } from '@playwright/test';

test('home and search hydrate in another locale with saved search history', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'pt-BR' });
  await context.addInitScript(() => localStorage.setItem('search_history', JSON.stringify(['crosswind technique'])));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search aviation references' }).fill('medical');
  await page.getByRole('button', { name: 'Search references' }).click();
  await expect(page).toHaveURL(/\/search\?q=medical/);
  await page.goto('/search/');
  await expect(page.getByRole('button', { name: 'crosswind technique', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'crosswind technique', exact: true }).click();
  await expect(page.getByLabel('Search FAR/AIM content')).toHaveValue('crosswind technique');
  expect(errors).toEqual([]);
  await context.close();
});

test('home and reference content are readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, title, heading, canonical] of [
    ['/', /FAR\/AIM Online \| Free Aviation Reference & Study Tools/, /Find the reference\. Free and open source\./, 'https://faraim.online'],
    ['/far/91', /14 CFR Part 91/, /General Operating and Flight Rules/i, 'https://faraim.online/far/91'],
    ['/aim/4', /AIM Chapter 4/, /Air Traffic Control/i, 'https://faraim.online/aim/4'],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', canonical);
  }
  await page.goto('/far/91#91.3');
  await expect(page.locator('[id="91.3"]')).toContainText('final authority');
  await expect(page.locator('[id="91.3"]')).toBeInViewport();

  for (const [path, title, heading, content, canonical] of [
    [
      '/quizzes/aim-chapter10-helicopter',
      /Helicopter Operations Quiz \| FAR\/AIM Online/,
      'Helicopter Operations Quiz',
      'Helicopter Operations Quiz',
      'https://faraim.online/quizzes/aim-chapter10-helicopter',
    ],
    [
      '/flashcards/far-definitions',
      /FAR Definitions \| FAR\/AIM Online/,
      'FAR Definitions',
      'Card 1 of 50',
      'https://faraim.online/flashcards/far-definitions',
    ],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('#root')).toHaveAttribute('data-prerendered', path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('#root')).toContainText(content);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', canonical);
  }
  await context.close();
});

test('reference hydration preserves content, saved state, and query links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('vite-ui-theme', 'dark');
    localStorage.setItem('far-aim-pro-reader-preferences', JSON.stringify({ fontScaleIndex: 2, density: 'comfortable' }));
    localStorage.setItem('far-aim-pro-reading-history', JSON.stringify([
      { type: 'aim', id: 4, title: 'Air Traffic Control', path: '/aim/4', timestamp: 1 },
    ]));
    localStorage.setItem('far-aim-pro-study-marks', JSON.stringify([
      { type: 'far', reference: '§ 91.3', title: 'Responsibility and authority of the pilot in command.', path: '/far/91#91.3', saved: true, note: 'Review before the checkride', updatedAt: 1 },
    ]));
  });

  let releaseData!: () => void;
  const dataReady = new Promise<void>((resolve) => { releaseData = resolve; });
  await page.route('**/assets/part91-*.json', async (route) => {
    await dataReady;
    await route.continue();
  });
  await page.goto('/far/91?highlight=authority#91.3');
  const heading = page.getByRole('heading', { level: 1, name: /General Operating and Flight Rules/i });
  await expect(heading).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.evaluate(() => {
    (window as Window & { originalHeading?: Element | null }).originalHeading = document.querySelector('h1');
  });
  releaseData();

  await expect(page.getByRole('button', { name: 'Remove saved mark for § 91.3', exact: true })).toBeVisible();
  await expect(page.locator('[id="91.3"] mark').first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit note for § 91.3', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note for § 91.3', exact: true })).toHaveValue('Review before the checkride');
  expect(await page.evaluate(() =>
    (window as Window & { originalHeading?: Element | null }).originalHeading === document.querySelector('h1'),
  )).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('far-aim-pro-reading-history') || '[]')))
    .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'aim', id: 4 })]));
  await page.getByRole('button', { name: 'Reader preferences' }).click();
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toContainText('110%');
  await expect(page.getByRole('button', { name: 'Comfort' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('a failed interactive data fetch keeps the static reference readable', async ({ page }) => {
  await page.route('**/assets/part91-*.json', (route) => route.abort());
  await page.goto('/far/91');
  await expect(page.getByRole('alert')).toContainText('Interactive tools could not load.');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /General Operating and Flight Rules/i })).toBeVisible();
  await expect(page.locator('[id="91.3"]')).toContainText('final authority');
  await expect(page.getByText('Loading page...', { exact: true })).toHaveCount(0);
});
