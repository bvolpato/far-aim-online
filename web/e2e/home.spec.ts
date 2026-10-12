import { expect, test } from '@playwright/test';

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows production landing content and primary navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/FAR\/AIM Online/);
    await expect(page.getByRole('heading', { name: 'Find the reference. Free and open source.' })).toBeVisible();
    await expect(page.getByText('FREE & OPEN SOURCE FOR PILOTS')).toBeVisible();
    const contributeLink = page.getByRole('link', { name: /Open-source project · pull requests welcome/ });
    await expect(contributeLink).toHaveAttribute('href', 'https://github.com/bvolpato/far-aim-online');
    await expect(contributeLink).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('search', { name: 'Reference search' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse Regulations/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Federal Aviation Regulations/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Aeronautical Information Manual/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Practice Quizzes/ })).toBeVisible();
  });

  test('navigates to key study surfaces', async ({ page }) => {
    await page.getByRole('link', { name: /Browse Regulations/ }).click();
    await expect(page).toHaveURL(/\/far$/);
    await expect(page.getByRole('heading', { name: 'Federal Aviation Regulations' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('link', { name: /Start Studying/ }).click();
    await expect(page).toHaveURL(/\/study$/);
    await expect(page.getByRole('heading', { name: /Study Hub/ })).toBeVisible();
  });

  test('submits desktop search from header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const searchInput = page.locator('header input[placeholder="Search regulations, terms..."]:visible');

    await searchInput.fill('airspace');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=airspace/);
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
    await expect(page.getByLabel('Search FAR/AIM content')).toHaveValue('airspace');
  });

  test('searches directly from the mobile homepage and trims the query', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const input = page.getByRole('searchbox', { name: 'Search aviation references' });
    await expect(input).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await input.fill('  medical certificate  ');
    await page.getByRole('button', { name: 'Search references' }).click();
    await expect(page).toHaveURL(/\/search\?q=medical%20certificate$/);
    await expect(page.getByLabel('Search FAR/AIM content')).toHaveValue('medical certificate');
  });

  test('resumes a previously opened reference from home', async ({ page }) => {
    await page.goto('/far/61');
    await expect(page.getByRole('heading', { name: /Certification: Pilots/i, level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'FAR/AIM Online Reference & study home' }).click();
    const recentReading = page.getByRole('region', { name: 'Continue reading' });
    await recentReading.getByRole('link').click();
    await expect(page).toHaveURL(/\/far\/61$/);
    await expect(page.getByRole('heading', { name: /Certification: Pilots/i, level: 1 })).toBeVisible();
  });

  test('mobile menu exposes navigation and search', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByLabel('Open navigation menu').click();
    await expect(page.getByRole('link', { name: /^FAR$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^AIM$/ })).toBeVisible();

    await page.getByPlaceholder('Search...').fill('medical certificate');
    await page.getByPlaceholder('Search...').press('Enter');
    await expect(page).toHaveURL(/\/search\?q=medical%20certificate/);
  });

  test('tablet navigation keeps page labels in an overflow menu', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Navigate: open page navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Navigate: open page navigation' }).click();

    const navigation = page.getByRole('navigation', { name: 'Page navigation' });
    await expect(navigation.getByRole('link', { name: 'Glossary' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Advisory Circulars' })).toBeVisible();
  });
});
