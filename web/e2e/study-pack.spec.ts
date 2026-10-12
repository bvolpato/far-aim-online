import { expect, test } from '@playwright/test';

test.describe('portable study pack', () => {
  test('exports and imports saved study notes', async ({ page }) => {
    const mark = {
      key: 'far:61.57',
      type: 'far',
      reference: '§ 61.57',
      title: 'Recent flight experience: Pilot in command',
      path: '/far/61#61.57',
      saved: true,
      highlighted: true,
      note: 'Review night currency before checkride.',
      savedAt: 1780800000000,
      updatedAt: 1780800000000,
    };

    await page.goto('/study');
    await page.evaluate((studyMark) => {
      localStorage.setItem('far-aim-pro-study-marks', JSON.stringify([studyMark]));
      localStorage.setItem('far-aim-pro-reading-history', JSON.stringify([]));
      localStorage.setItem('search_history', JSON.stringify(['night currency']));
    }, mark);
    await page.reload();

    await expect(page.getByText('Review night currency before checkride.')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    await page.evaluate(() => {
      localStorage.removeItem('far-aim-pro-study-marks');
      localStorage.removeItem('far-aim-pro-reading-history');
      localStorage.removeItem('search_history');
    });
    await page.reload();

    await expect(page.getByText('Review night currency before checkride.')).not.toBeVisible();

    await page.getByTestId('study-pack-input').setInputFiles(filePath!);

    await expect(page.getByText('Imported 1 saved items')).toBeVisible();
    await expect(page.getByText('Review night currency before checkride.')).toBeVisible();
  });

  test('shows the complete saved study queue', async ({ page }) => {
    const marks = Array.from({ length: 7 }, (_, index) => ({
      key: `far:61.${index + 1}`,
      type: 'far',
      reference: `§ 61.${index + 1}`,
      title: `Saved study item ${index + 1}`,
      path: `/far/61#61.${index + 1}`,
      saved: true,
      highlighted: false,
      note: '',
      savedAt: 1780800000000 + index,
      updatedAt: 1780800000000 + index,
    }));

    await page.goto('/study');
    await page.evaluate((studyMarks) => {
      localStorage.setItem('far-aim-pro-study-marks', JSON.stringify(studyMarks));
    }, marks);
    await page.reload();

    for (const mark of marks) {
      await expect(page.getByText(mark.title)).toBeVisible();
    }
  });
});
