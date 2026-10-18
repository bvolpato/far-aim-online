import { expect, test } from '@playwright/test';

test('keeps quiz, flashcard, and advisory circular lists within narrow viewports', async ({ page }) => {
  const routes = [
    { path: '/quizzes', heading: 'Practice Quizzes', cardName: /The Ultimate Pilot Challenge/ },
    { path: '/flashcards', heading: 'Flashcard Decks', cardName: /Airspace Classes & Requirements/ },
    { path: '/advisory-circulars', heading: 'Advisory Circulars', cardName: /FAA page/ },
  ];

  for (const viewport of [
    { width: 312, height: 844 },
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
      await expect(page.getByRole('link', { name: route.cardName }).first()).toBeVisible();
      await expect.poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true);

      if (route.path === '/advisory-circulars') {
        const allFilter = page.getByRole('button', { name: 'All', exact: true });
        const allFilterBox = await allFilter.boundingBox();
        if (!allFilterBox) throw new Error('Advisory Circulars All filter has no visible box');
        expect(allFilterBox.height).toBeGreaterThanOrEqual(44);

        await page.getByRole('button', { name: 'More filters' }).click();
        const longFilter = page.getByRole('button', {
          name: 'Aviation Maintenance Technician Schools',
          exact: true,
        });
        await expect(longFilter).toBeVisible();
        const longFilterBox = await longFilter.boundingBox();
        if (!longFilterBox) throw new Error('Long advisory category filter has no visible box');
        expect(longFilterBox.height).toBeGreaterThanOrEqual(44);
        expect(longFilterBox.x + longFilterBox.width).toBeLessThanOrEqual(viewport.width + 1);
        await expect.poll(() =>
          page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        ).toBe(true);
      }
    }
  }
});
