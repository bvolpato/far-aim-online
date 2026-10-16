import { expect, test } from '@playwright/test';

for (const width of [320, 390]) {
  test(`mobile study links fit and remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/study');
    await expect(page.getByRole('heading', { name: 'Study Hub', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const quiz = page.getByRole('link', { name: 'Part 67 & 68: Medical Standards 25q', exact: true });
    await quiz.scrollIntoViewIfNeeded();
    const bounds = await quiz.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await quiz.click();
    await expect(page.getByRole('heading', { name: 'Part 67 & 68: Medical Standards', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Quiz', exact: true })).toBeVisible();
  });
}
