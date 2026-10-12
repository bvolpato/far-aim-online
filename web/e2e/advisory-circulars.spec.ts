import { expect, test } from '@playwright/test';

test.describe('advisory circulars', () => {
  test('browses and filters FAA advisory circulars', async ({ page }) => {
    await page.goto('/advisory-circulars');

    await expect(page).toHaveTitle(/FAA Advisory Circulars/);
    await expect(page.getByRole('heading', { name: 'Advisory Circulars' })).toBeVisible();
    await expect(page.getByText(/\d+ current FAA Advisory Circular records/)).toBeVisible();
    await expect(page.getByText('AC 20-109B')).toBeVisible();

    await page.getByPlaceholder(/Search forms/).fill('service difficulty');

    await expect(page.getByText('AC 20-109B')).toBeVisible();
    await expect(page.getByText('AC 20-62E')).not.toBeVisible();
    await expect(page.getByLabel('Save AC 20-109B')).toBeVisible();
  });

  test('returns advisory circulars in global search and opens the reader', async ({ page }) => {
    await page.goto('/search?q=service%20difficulty');

    await expect(page.getByRole('button', { name: 'ACs' })).toBeVisible();
    const result = page.getByRole('link', { name: /Service Difficulty Reporting System/ }).first();
    await expect(result).toBeVisible();

    await result.click();

    await expect(page).toHaveURL(
      /\/advisory-circulars\/ac-20-109b\?highlight=service%20difficulty/,
    );
    await expect(page).toHaveTitle('AC 20-109B | FAR/AIM Online');
    await expect(
      page.getByRole('heading', { name: /Service Difficulty Reporting System/ }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'FAA page' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Official PDF' })).toBeVisible();
  });

  test('labels incomplete PDF extraction without hiding official source', async ({ page }) => {
    await page.goto('/advisory-circulars#ac-00-34b');
    await expect(page.locator('#ac-00-34b')).toContainText('Partial offline text');

    await page.goto('/advisory-circulars/ac-00-34b');

    await expect(page.getByText(/\d+ of \d+ pages extracted/)).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Extracted text is incomplete');
    await expect(page.getByRole('link', { name: 'Official PDF' })).toBeVisible();
  });

  test('shows the catalog reason when offline text is unavailable', async ({ page }) => {
    const reason = 'Offline text is excluded because redistribution permission is not confirmed.';
    await page.route('**/*.json', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes('"ac-8260-32f"')) {
        await route.fulfill({ response });
        return;
      }

      const catalog = JSON.parse(body) as {
        items: Array<{ id: string; contentError?: string }>;
      };
      const circular = catalog.items.find((item) => item.id === 'ac-8260-32f');
      if (circular) circular.contentError = reason;
      await route.fulfill({ response, body: JSON.stringify(catalog) });
    });

    await page.goto('/advisory-circulars/ac-8260-32f');

    await expect(page.getByRole('heading', { name: 'United States Air Force Terminal Instrument Procedures Service' })).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByText(/has not produced usable text yet/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'FAA page' })).toHaveAttribute(
      'href',
      'https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1035254',
    );
  });
});
