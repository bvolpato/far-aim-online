import { expect, test } from '@playwright/test';

test.describe('theme menu', () => {
  test('switches to dark and light modes and persists selection', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Toggle theme').click();
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByLabel('Toggle theme').click();
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('theme toggle is available on primary pages', async ({ page }) => {
    for (const route of ['/', '/far', '/aim', '/glossary', '/study', '/quizzes', '/flashcards']) {
      await page.goto(route);
      await expect(page.getByLabel('Toggle theme')).toBeVisible();
    }
  });
});
