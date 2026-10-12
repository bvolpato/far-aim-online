import { expect, test } from '@playwright/test';

test.describe('AIM reader', () => {
  test('lists AIM chapters and filters by content', async ({ page }) => {
    await page.goto('/aim');

    await expect(page).toHaveTitle(/Aeronautical Information Manual/);
    await expect(page.getByRole('heading', { name: 'Aeronautical Information Manual' })).toBeVisible();
    await expect(page.getByRole('link', { name: /General 6 sections General Information/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Chapter 0/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Chapter 1 24 sections Air/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Chapter 4 108 sections/ })).toBeVisible();

    await page.getByPlaceholder('Search chapters by title or content...').fill('airspace');
    await expect(page.getByText(/Found \d+ chapters? matching "airspace"/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Chapter 3/ }).first()).toBeVisible();
  });

  test('opens an AIM chapter with expanded sections and figures', async ({ page }) => {
    await page.goto('/aim/1');

    await expect(page).toHaveTitle(/AIM Chapter 1/);
    await expect(page.getByRole('heading', { name: 'Air Navigation', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Sections \(24\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse AIM 1-1-1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse AIM 1-1-8', exact: true }).scrollIntoViewIfNeeded();
    const figure = page.locator('#section-1-1-8-content button[aria-label^="Open"] img[src*="section-1-1-8"]').first();
    await expect(figure).toBeVisible();
    await figure.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close figure' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('renders structured tables without raw crawler table blocks', async ({ page }) => {
    await page.goto('/aim/3#3-1-4');

    await expect(page.getByRole('heading', { name: 'Airspace', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Collapse AIM 3-1-4/ })).toBeVisible();
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('caption')).toBeVisible();
    await expect(table.locator('caption')).not.toHaveText('');
    await expect(table.locator('th[scope="col"]').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('[TABLE]');
  });

  test('rejects malformed AIM chapter routes', async ({ page }) => {
    await page.goto('/aim/1junk');

    await expect(page.getByRole('heading', { name: 'AIM chapter not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse AIM index' })).toBeVisible();
  });
});
