import { devices, expect, test } from '@playwright/test';

test.use({ ...devices['Pixel 7'] });

test.describe('mobile core workflow', () => {
  test('searches structured content and opens a reader without horizontal overflow', async ({ page }) => {
    await page.goto('/search?q=MIDDLE%20MARKER');

    const glossaryResult = page.locator('a[href^="/glossary"][href$="#MIDDLE%20MARKER"]');
    await expect(glossaryResult).toBeVisible();
    await glossaryResult.click();

    await expect(page.locator('[id="MIDDLE MARKER"]')).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      .toBe(true);
  });

  test('opens a deep-linked FAR section', async ({ page }) => {
    await page.goto('/far/61#61.3');

    await expect(page.locator('[id="61.3"]')).toBeInViewport();
    await expect(page.locator('[id="61.3"]').getByRole('heading', { name: /61\.3/ })).toBeVisible();
  });
});
