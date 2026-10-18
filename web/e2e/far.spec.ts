import { expect, test } from '@playwright/test';

test.describe('FAR reader', () => {
  test('lists pilot FAR parts and filters by content', async ({ page }) => {
    await page.goto('/far');

    await expect(page).toHaveTitle(/Federal Aviation Regulations/);
    await expect(page.getByRole('heading', { name: 'Federal Aviation Regulations' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Part 61/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Part 91/ }).first()).toBeVisible();

    await page.getByPlaceholder('Search parts by number, title, or content...').fill('private pilot');
    await expect(page.getByText(/Found \d+ parts? matching "private pilot"/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Part 61/ }).first()).toBeVisible();
  });

  test('opens a FAR part with table of contents and searchable sections', async ({ page }) => {
    await page.goto('/far/61');

    await expect(page).toHaveTitle(/14 CFR Part 61/);
    await expect(page.getByRole('heading', { name: /Certification: Pilots/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /References \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reader preferences' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /§\s*61\.1 Applicability and definitions/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share § 61.1', exact: true })).toBeVisible();

    await page.getByPlaceholder('Search within this part...').fill('private pilot');
    await expect(page.getByRole('heading', { name: /§\s*61\.113 Private pilot privileges/ })).toBeVisible();
  });

  test('persists reader text size and density controls', async ({ page }) => {
    await page.goto('/far/61');

    await page.getByRole('button', { name: 'Reader preferences' }).click();
    await page.getByRole('button', { name: 'Increase reader text size' }).click();
    await page.getByRole('button', { name: 'Comfort' }).click();

    await expect(page.getByRole('dialog', { name: 'Reader settings' })).toContainText('110%');
    await expect(page.getByRole('button', { name: 'Comfort' })).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await page.getByRole('button', { name: 'Reader preferences' }).click();

    await expect(page.getByRole('dialog', { name: 'Reader settings' })).toContainText('110%');
    await expect(page.getByRole('button', { name: 'Comfort' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps reader preferences reachable in short and standard mobile viewports', async ({ page }) => {
    await page.goto('/far/61');

    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      const toggle = page.getByRole('button', { name: 'Reader preferences' });
      await toggle.click();

      const dialog = page.getByRole('dialog', { name: 'Reader settings' });
      const dialogBox = await dialog.boundingBox();
      if (!dialogBox) throw new Error('Reader settings dialog has no visible box');
      expect(dialogBox.y).toBeGreaterThanOrEqual(0);
      expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height);

      const reset = dialog.getByRole('button', { name: 'Reset reader controls' });
      const resetBox = await reset.boundingBox();
      if (!resetBox) throw new Error('Reader controls reset button has no visible box');
      expect(resetBox.y).toBeGreaterThanOrEqual(0);
      expect(resetBox.y + resetBox.height).toBeLessThanOrEqual(viewport.height);
      await expect(dialog.getByText('Reader Settings')).toBeInViewport();

      await reset.click();
      await toggle.click();
    }
  });

  test('supports direct deep links to FAR sections', async ({ page }) => {
    await page.goto('/far/91#91.3');

    await expect(page.getByRole('heading', { name: /§\s*91\.3 Responsibility and authority/ })).toBeVisible();
    await expect(page.getByText(/final authority as to,\s+the operation of that aircraft/i)).toBeVisible();
  });

  test('includes appendices in navigation and supports direct appendix links', async ({ page }) => {
    await page.goto('/far/61#Appendix%20A%20to%20Part%2061');

    const appendix = page.locator('[id="Appendix A to Part 61"]');
    await expect(appendix).toBeInViewport();
    await expect(appendix).toContainText('Airman Certification Standards');
    await expect(page.getByRole('link', { name: /Airman Certification Standards/ }).first()).toBeVisible();
  });

  test('renders image-only eCFR appendices from offline assets', async ({ page }) => {
    await page.goto('/far/25#Appendix%20A%20to%20Part%2025');

    const appendix = page.locator('[id="Appendix A to Part 25"]');
    await expect(appendix).toBeInViewport();
    const figureButton = appendix.getByRole('button', { name: /Open Figure 1 in Appendix A to Part 25/i });
    await expect(figureButton).toBeVisible();
    await expect(figureButton.locator('img')).toHaveJSProperty('complete', true);
  });

  test('rejects malformed FAR part routes', async ({ page }) => {
    await page.goto('/far/61junk');

    await expect(page.getByRole('heading', { name: 'FAR part not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse FAR index' })).toBeVisible();
  });

  test('saves section notes into the study queue', async ({ page }) => {
    await page.goto('/far/61');

    await page.getByRole('button', { name: 'Save § 61.1', exact: true }).click();
    await page.getByRole('button', { name: 'Add note for § 61.1', exact: true }).click();
    await page.locator('#note-far--61-1').fill('Review definitions before CFI oral.');
    await page.getByRole('button', { name: 'Save note for § 61.1', exact: true }).click();
    await page.getByRole('button', { name: 'Save § 61.3', exact: true }).click();

    await page.goto('/study');

    await expect(page.getByRole('heading', { name: 'Saved & Notes' })).toBeVisible();
    await expect(page.getByText('§ 61.1')).toBeVisible();
    await expect(page.getByText('Applicability and definitions')).toBeVisible();
    await expect(page.getByText('Review definitions before CFI oral.')).toBeVisible();
    await expect(page.getByText('Requirement for certificates, ratings, privileges, and authorizations')).toBeVisible();
  });
});
