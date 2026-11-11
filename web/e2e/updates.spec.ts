import { expect, test } from '@playwright/test';
import sourceStatus from '../../data/source-status.json' with { type: 'json' };

test.describe('updates page', () => {
  test('shows source dates, release notes, and known limits', async ({ page }) => {
    await page.goto('/updates');

    await expect(page).toHaveTitle(/Data Updates/);
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
    await expect(page.getByText('Federal Aviation Regulations')).toBeVisible();
    const farSource = sourceStatus.sources.find(source => source.id === 'far');
    expect(farSource).toBeDefined();
    await expect(page.getByText(farSource!.lastUpdated).first()).toBeVisible();
    await expect(page.getByText('Aeronautical Information Manual')).toBeVisible();
    await expect(page.getByText('2026-07-09').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change Watch' })).toBeVisible();
    await expect(page.getByText('FAR/eCFR snapshot refreshed')).toBeVisible();
    const farChange = sourceStatus.changeWatch.find(change => change.sourceId === 'far');
    expect(farChange).toBeDefined();
    await expect(page.getByText(farChange!.affectedReferences[0], { exact: true })).toBeVisible();
    await expect(page.getByText('Review saved FAR notes and highlights')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Release Notes' })).toBeVisible();
    await expect(page.getByText('FAR figure and crawler fidelity')).toBeVisible();
    await expect(page.getByText(/Bundled 591 official eCFR figures/)).toBeVisible();
    const acSource = sourceStatus.sources.find(source => source.id === 'ac');
    expect(acSource).toBeDefined();
    await expect(page.getByText(acSource!.coverage)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Known Limits' })).toBeVisible();
    await expect(page.getByText('Cloud sync is not included')).toBeVisible();
  });
});
