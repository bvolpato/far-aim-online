import { expect, test } from '@playwright/test';

test.describe('legal pages', () => {
  test('shows privacy policy and terms from footer links', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page).toHaveTitle(/Privacy Policy/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText(/leetllmcontact@gmail\.com/)).toBeVisible();

    await page.getByRole('link', { name: 'Terms' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page).toHaveTitle(/Terms of Service/);
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText('Educational Use')).toBeVisible();
  });
});
