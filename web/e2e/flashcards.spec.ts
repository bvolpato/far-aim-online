import { expect, test } from '@playwright/test';

test.describe('flashcards', () => {
  test('lists decks and opens a FAR deck', async ({ page }) => {
    await page.goto('/flashcards');

    await expect(page).toHaveTitle(/Flashcard Decks/);
    await expect(page.getByRole('heading', { name: 'Flashcard Decks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Aeronautical Information Manual/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Federal Aviation Regulations/ })).toBeVisible();

    await page.getByRole('link', { name: /FAR Definitions/ }).click();
    await expect(page).toHaveURL(/\/flashcards\/far-definitions$/);
    await expect(page.getByText('Card 1 of 50')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aircraft' })).toBeVisible();
  });

  test('flips, marks, and navigates cards', async ({ page }) => {
    await page.goto('/flashcards/far-definitions');

    const flashcard = page.getByRole('button', { name: /Show definition for Aircraft/i });
    await expect(flashcard).toBeVisible();
    await flashcard.press('Enter');
    await expect(page.getByRole('button', { name: /Show term for Aircraft/i })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.flashcard').click();
    await expect(page.getByText('Definition', { exact: true })).toBeVisible();
    await expect(page.getByText(/device that is used or intended to be used for flight/i)).toBeVisible();

    await page.getByRole('button', { name: /Got It/ }).click();
    await expect(page.getByText('Card 2 of 50')).toBeVisible();
    await expect(page.getByText(/^1$/)).toBeVisible();

    await page.getByRole('button', { name: /Previous/ }).click();
    await expect(page.getByText('Card 1 of 50')).toBeVisible();
  });

  test('shows completion, missed-card review, and restart states', async ({ page }) => {
    await page.goto('/flashcards/aim-chapter10-helicopter');

    await page.getByRole('button', { name: 'Still Learning' }).click();
    for (let index = 1; index < 15; index += 1) {
      await page.getByRole('button', { name: 'Got It!' }).click();
    }

    await expect(page.getByRole('heading', { name: 'Nice work' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review 1 missed card' })).toBeVisible();

    await page.getByRole('button', { name: 'Review 1 missed card' }).click();
    await page.getByRole('button', { name: 'Got It!' }).click();
    await expect(page.getByRole('heading', { name: 'Missed cards reviewed' })).toBeVisible();

    await page.getByRole('button', { name: 'Restart deck' }).click();
    await expect(page.getByText('Card 1 of 15')).toBeVisible();
  });
});
