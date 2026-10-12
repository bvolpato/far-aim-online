import { expect, test } from '@playwright/test';

test.describe('glossary', () => {
  test('shows PCG terms and filters definitions', async ({ page }) => {
    await page.goto('/glossary');

    await expect(page).toHaveTitle(/Pilot\/Controller Glossary/);
    await expect(page.getByRole('heading', { name: 'Pilot/Controller Glossary' })).toBeVisible();
    await expect(page.getByText(/Showing \d+ terms/)).toBeVisible();

    await page.getByLabel('Filter glossary terms').fill('airspace');
    await expect(page.getByText(/Showing \d+ terms/)).toBeVisible();
    await expect(page.locator('mark').first()).toBeVisible();
    await expect(page.getByText(/AIRSPACE/i).first()).toBeVisible();
  });

  test('supports empty state and clear filter', async ({ page }) => {
    await page.goto('/glossary');

    await page.getByLabel('Filter glossary terms').fill('zzznomatch12345');
    await expect(page.getByText('No terms found matching "zzznomatch12345"')).toBeVisible();

    await page.getByLabel('Clear glossary filter').click();
    await expect(page.getByLabel('Filter glossary terms')).toHaveValue('');
    await expect(page.getByText(/Showing \d+ terms/)).toBeVisible();
  });

  test('renders see-only entries as expanded definitions', async ({ page }) => {
    await page.goto('/glossary');

    await page.getByLabel('Filter glossary terms').fill('AAM');

    await expect(page.getByRole('heading', { name: 'AAM', exact: true })).toBeVisible();
    await expect(page.getByText(/ADVANCED AIR MOBILITY \(AAM\): A transportation system/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('(See ADVANCED AIR MOBILITY');
  });

  test('navigates normalized inline see references', async ({ page }) => {
    await page.goto('/glossary');

    await page.getByLabel('Filter glossary terms').fill('MIDDLE MARKER');
    const middleMarker = page.locator('[id="MIDDLE MARKER"]');
    await expect(middleMarker).toBeInViewport();
    await middleMarker.getByRole('link', { name: 'MARKER BEACON' }).click();

    await expect(page.getByLabel('Filter glossary terms')).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'MARKER BEACON', exact: true })).toBeInViewport();
  });

  test('keeps ICAO see references distinct from base terms', async ({ page }) => {
    await page.goto('/glossary');

    await page.getByLabel('Filter glossary terms').fill('ACROBATIC FLIGHT');

    const baseTerm = page.locator('[id="ACROBATIC FLIGHT"]');
    await expect(baseTerm).toContainText('See ICAO term ACROBATIC FLIGHT');

    await baseTerm.getByRole('link', { name: 'ACROBATIC FLIGHT' }).click();
    await expect(page.getByRole('heading', { name: 'ACROBATIC FLIGHT [ICAO]', exact: true })).toBeInViewport();
  });
});
