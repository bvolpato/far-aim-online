import { expect, test } from '@playwright/test';

test.describe('quizzes', () => {
  test('lists quiz categories and opens a known quiz', async ({ page }) => {
    await page.goto('/quizzes');

    await expect(page).toHaveTitle(/Practice Quizzes/);
    await expect(page.getByRole('heading', { name: 'Practice Quizzes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Aeronautical Information Manual/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Federal Aviation Regulations/ })).toBeVisible();

    await page.getByRole('link', { name: /Helicopter Operations Quiz/ }).click();
    await expect(page).toHaveURL(/\/quizzes\/aim-chapter10-helicopter$/);
    await expect(page.getByRole('heading', { name: 'Helicopter Operations Quiz' })).toBeVisible();
    await expect(page.getByText('15', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Quiz' })).toBeVisible();
  });

  test('answers questions and reaches results', async ({ page }) => {
    await page.goto('/quizzes/aim-chapter10-helicopter');
    await page.getByRole('button', { name: 'Start Quiz' }).click();

    await expect(page.getByText('Question 1 of 15')).toBeVisible();

    for (let question = 1; question <= 15; question += 1) {
      await page.locator('.space-y-3 button').first().click();
      await expect(page.getByRole('heading', { name: 'Explanation' })).toBeVisible();

      const nextButton = page.getByRole('button', {
        name: question < 15 ? /Next Question/ : 'See Results',
      });
      await nextButton.click();
    }

    await expect(page.getByRole('heading', { name: /Keep Practicing|Congratulations/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Answers' })).toBeVisible();
  });
});
