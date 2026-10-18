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

  test('keeps FAR, AIM, and glossary readers within narrow mobile viewports', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });

      await page.goto('/far/61');
      await expect(page.getByRole('link', { name: /Next Part 63:/ })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await page.goto('/aim/4');
      await expect(page.getByRole('link', { name: /Next Ch\. 5:/ })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.getByRole('button', { name: 'Expand AIM 4-1-9' }).click();
      const tableScroller = page.locator('#section-4-1-9-content .overflow-x-auto').filter({ has: page.locator('table') }).first();
      await expect(tableScroller).toBeVisible();
      await expect.poll(() => tableScroller.evaluate(element =>
        element.getBoundingClientRect().right <= window.innerWidth + 1
      )).toBe(true);
      if (width === 320) {
        expect(await tableScroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      }

      await page.goto('/glossary');
      const longDefinition = page.locator('[id="PREFERRED IFR ROUTES"] .prose p');
      await expect(longDefinition).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await expect.poll(() => longDefinition.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

      const alphabetButton = page.getByRole('button', { name: 'Jump to terms starting with A' });
      await expect(alphabetButton).toBeVisible();
      expect(await alphabetButton.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
  });

  test('browses an AIM outline and opens deep-linked content without overflow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/aim/4');
    await expect(page.getByRole('button', { name: 'Expand AIM 4-1-1', exact: true })).toBeVisible();
    await expect(page.locator('button[aria-label^="Collapse AIM"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open table of contents drawer' }).click();
    await page.getByRole('dialog').locator('a[href="#4-1-2"]').click();
    await expect(page.getByRole('button', { name: 'Collapse AIM 4-1-2', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Collapse AIM 4-1-2', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
    await expect(page.locator('button[aria-label^="Collapse AIM"]')).toHaveCount(0);
    await page.goto('/aim/4#4-1-2');
    await expect(page.getByRole('button', { name: 'Collapse AIM 4-1-2', exact: true })).toBeInViewport();
    await expect(page.locator('#section-4-1-2-content')).toContainText('Towers have been established');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByPlaceholder('Search within this chapter...').fill('4-1-9');
    await expect(page.getByRole('button', { name: 'Collapse AIM 4-1-9', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
