import { expect, test } from '@playwright/test';

test.describe('FAR reader navigation', () => {
  test('keeps explicit section and appendix anchors ahead of search auto-scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/far/61?highlight=flight%20review#61.56');

    const section = page.locator('[id="61.56"]');
    const sectionHeading = section.getByRole('heading', { name: /§\s*61\.56 Flight review/ });
    await expect(section).toBeVisible();
    await page.waitForTimeout(600);
    await expect(section).toBeInViewport();
    const headerBottom = await page.locator('header').evaluate(element => element.getBoundingClientRect().bottom);
    const headingTop = await sectionHeading.evaluate(element => element.getBoundingClientRect().top);
    expect(headingTop).toBeGreaterThanOrEqual(headerBottom);
    await expect(page.locator('mark').filter({ hasText: /flight/i }).first()).toBeVisible();

    await page.goto('/far/61?highlight=flight%20review#Appendix%20A%20to%20Part%2061');

    const appendix = page.locator('[id="Appendix A to Part 61"]');
    await expect(appendix).toBeVisible();
    await page.waitForTimeout(600);
    await expect(appendix).toBeInViewport();
    await expect(page.locator('mark').filter({ hasText: /flight/i }).first()).toBeVisible();
  });

  test('navigates around non-pilot parts and retains the full-index context', async ({ page }) => {
    await page.goto('/far/22');

    const previousPart = page.getByRole('link', { name: /Previous Part 21:/ });
    const nextPart = page.getByRole('link', { name: /Next Part 23:/ });
    await expect(previousPart).toHaveAttribute('href', '/far/21?index=all');
    await expect(nextPart).toHaveAttribute('href', '/far/23?index=all');
    await nextPart.click();
    await expect(page).toHaveURL(/\/far\/23\?index=all$/);
    await expect(page.getByRole('link', { name: /Previous Part 22:/ })).toBeVisible();

    await page.goto('/far?index=all');
    const part22 = page.locator('a[href="/far/22?index=all"]').first();
    await expect(part22).toBeVisible();
    await part22.click();
    await expect(page).toHaveURL(/\/far\/22\?index=all$/);
    await expect(page.getByRole('link', { name: /Next Part 23:/ })).toBeVisible();
  });
});
