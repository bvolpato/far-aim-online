import { expect, test, type Page } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT || '34173';
const previewOrigin = `http://127.0.0.1:${port}`;
const productionOrigin = 'https://faraim.online';

async function proxyProductionOrigin(page: Page) {
  await page.route(`${productionOrigin}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const response = await fetch(`${previewOrigin}${requestUrl.pathname}${requestUrl.search}`);
    await route.fulfill({
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'text/html' },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

async function stubGoogleTag(page: Page) {
  const requests: string[] = [];
  await page.route('https://www.googletagmanager.com/gtag/js**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.__analyticsTagStubLoaded = true;',
    });
  });
  return requests;
}

async function simulateProductionVisitor(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false });
  });
  await proxyProductionOrigin(page);
}

async function readDataLayer(page: Page) {
  return page.evaluate(() => (window as Window & { dataLayer?: IArguments[] }).dataLayer?.map((args) => Array.from(args)) ?? []);
}

function commandEntries(layer: unknown[][], command: string) {
  return layer.filter(([name]) => name === command);
}

test.describe('opt-in analytics', () => {
  test('does not load Google before choice or after declining', async ({ page }) => {
    const tagRequests = await stubGoogleTag(page);
    await simulateProductionVisitor(page);
    await page.goto(`${productionOrigin}/?q=private-search#private-section`);

    await expect(page.getByRole('region', { name: 'Analytics preferences' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy policy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allow analytics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No thanks' })).toBeVisible();
    expect(tagRequests).toHaveLength(0);

    await page.getByRole('button', { name: 'No thanks' }).click();
    await expect(page.getByRole('region', { name: 'Analytics preferences' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('faraim-analytics-consent-v1'))).toBe('denied');
    expect(tagRequests).toHaveLength(0);

    await page.getByRole('link', { name: 'FAR', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Federal Aviation Regulations', exact: true })).toBeVisible();
    expect(tagRequests).toHaveLength(0);
    expect(await readDataLayer(page)).toHaveLength(0);
  });

  test('loads once after opt-in and records sanitized pathname changes only', async ({ page }) => {
    const tagRequests = await stubGoogleTag(page);
    await simulateProductionVisitor(page);
    await page.goto(`${productionOrigin}/?q=private-search#private-section`);

    await page.getByRole('button', { name: 'Allow analytics' }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { __analyticsTagStubLoaded?: boolean }).__analyticsTagStubLoaded)).toBe(true);
    await expect.poll(async () => commandEntries(await readDataLayer(page), 'event').length).toBe(1);
    expect(tagRequests).toHaveLength(1);

    const firstLayer = await readDataLayer(page);
    const consentCommands = commandEntries(firstLayer, 'consent');
    expect(consentCommands).toEqual([
      ['consent', 'default', expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })],
      ['consent', 'update', expect.objectContaining({
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })],
    ]);

    const firstConfig = commandEntries(firstLayer, 'config')[0];
    expect(firstConfig?.[1]).toBe('G-VRZ5WP8Q5H');
    expect(firstConfig?.[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: `${productionOrigin}/`,
      page_title: 'Home',
    });
    expect(JSON.stringify(firstLayer)).not.toContain('private-search');
    expect(JSON.stringify(firstLayer)).not.toContain('private-section');

    await page.getByRole('link', { name: 'FAR', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Federal Aviation Regulations', exact: true })).toBeVisible();
    await expect.poll(async () => commandEntries(await readDataLayer(page), 'event').length).toBe(2);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/far?search=private-query&note=private-note#private-hash');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(100);

    const layer = await readDataLayer(page);
    expect(commandEntries(layer, 'event')).toHaveLength(2);
    expect(JSON.stringify(layer)).not.toContain('private-query');
    expect(JSON.stringify(layer)).not.toContain('private-note');
    expect(JSON.stringify(layer)).not.toContain('private-hash');
    expect(commandEntries(layer, 'set').at(-1)?.[1]).toMatchObject({
      page_location: `${productionOrigin}/far`,
      page_referrer: `${productionOrigin}/`,
      page_title: 'Federal Aviation Regulations',
    });
    expect(tagRequests).toHaveLength(1);
  });

  test('revocation stops page views and clears first-party GA cookies', async ({ page }) => {
    const tagRequests = await stubGoogleTag(page);
    await simulateProductionVisitor(page);
    await page.goto(productionOrigin);
    await page.getByRole('button', { name: 'Allow analytics' }).click();
    await expect.poll(async () => commandEntries(await readDataLayer(page), 'event').length).toBe(1);

    await page.evaluate(() => {
      document.cookie = '_ga=old; path=/; SameSite=Lax';
      document.cookie = '_ga_VRZ5WP8Q5H=old; path=/; SameSite=Lax';
    });
    await page.getByRole('button', { name: 'Analytics preferences' }).click();
    await page.getByRole('button', { name: 'Turn off analytics' }).click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem('faraim-analytics-consent-v1'))).toBe('denied');
    await expect.poll(() => page.evaluate(() => document.cookie)).not.toContain('_ga');
    expect(await page.evaluate(() => (window as Window & { 'ga-disable-G-VRZ5WP8Q5H'?: boolean })['ga-disable-G-VRZ5WP8Q5H'])).toBe(true);

    await page.getByRole('link', { name: 'FAR', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Federal Aviation Regulations', exact: true })).toBeVisible();
    expect(commandEntries(await readDataLayer(page), 'event')).toHaveLength(1);
    expect(tagRequests).toHaveLength(1);

    await page.getByRole('button', { name: 'Analytics preferences' }).click();
    await page.getByRole('button', { name: 'Allow analytics' }).click();
    await expect.poll(async () => commandEntries(await readDataLayer(page), 'event').length).toBe(2);
    const consentUpdates = commandEntries(await readDataLayer(page), 'consent')
      .filter(([, action]) => action === 'update');
    expect(consentUpdates.map(([, , value]) => (value as { analytics_storage: string }).analytics_storage))
      .toEqual(['granted', 'denied', 'granted']);
    expect(tagRequests).toHaveLength(1);
  });

  test('skips local and automated browser sessions', async ({ page }) => {
    const tagRequests = await stubGoogleTag(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Analytics preferences' })).toHaveCount(0);
    expect(tagRequests).toHaveLength(0);

    await proxyProductionOrigin(page);
    await page.goto(productionOrigin);
    await expect(page.getByRole('button', { name: 'Analytics preferences' })).toHaveCount(0);
    expect(tagRequests).toHaveLength(0);
  });
});
