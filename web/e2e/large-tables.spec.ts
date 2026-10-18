import { expect, test } from '@playwright/test';

test('pages the large FAR hazardous materials table and finds off-page matches', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/far/172?highlight=Zirconium%20tetrachloride#172.101');
  const table = page.locator('table').filter({ hasText: '(1) Symbols' });
  const tableContainer = table.locator('xpath=../..');

  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(table.getByRole('columnheader')).toHaveCount(14);
  await expect(table.locator('caption')).toContainText('FAR 172.101');

  const bodyRowCount = Number(await table.getAttribute('aria-rowcount')) - 1;
  expect(bodyRowCount).toBeGreaterThan(3000);
  const routeRowCounts = await page.locator('table').evaluateAll((tables) =>
    tables.map((currentTable) => currentTable.querySelectorAll('tbody tr').length),
  );
  expect(Math.max(...routeRowCounts)).toBeLessThanOrEqual(50);

  const searchStatus = tableContainer.getByText(/^\d+ highlighted rows?; match 1 of \d+, row \d+$/);
  await expect(searchStatus).toBeVisible();
  const initialMatch = await searchStatus.innerText();
  const match = initialMatch.match(/match 1 of (\d+), row (\d+)/);
  if (!match) throw new Error(`Could not read the selected table match from: ${initialMatch}`);
  const totalMatches = Number(match[1]);
  const matchedSourceRow = Number(match[2]);
  expect(matchedSourceRow).toBeGreaterThan(25);

  const selectedRow = table.locator(`tbody tr[aria-rowindex="${matchedSourceRow + 1}"]`);
  await expect(selectedRow).toContainText('Zirconium tetrachloride');
  expect(await selectedRow.locator('td').evaluateAll((cells) =>
    cells.some((cell) => cell.textContent?.toLowerCase().includes('zirconium tetrachloride')),
  )).toBe(true);
  if (totalMatches > 1) {
    await tableContainer.getByRole('button', { name: 'Next matching row' }).click();
    await expect(tableContainer.getByText(new RegExp(`match 2 of ${totalMatches}, row \\d+`))).toBeVisible();
  }

  await page.goto('/far/172?highlight=consumer%20gross#172.101');
  const splitCellTable = page.locator('table').filter({ hasText: '(1) Symbols' });
  const splitCellContainer = splitCellTable.locator('xpath=../..');
  const splitCellStatus = splitCellContainer.getByText(/^\d+ highlighted rows?; match 1 of \d+, row \d+$/);
  await expect(splitCellStatus).toBeVisible();
  const splitCellMatch = (await splitCellStatus.innerText()).match(/row (\d+)/);
  if (!splitCellMatch) throw new Error('Could not read the selected split-cell table match');
  const splitCellRowIndex = Number(splitCellMatch[1]);
  const splitCellRow = splitCellTable.locator(`tbody tr[aria-rowindex="${splitCellRowIndex + 1}"]`);
  const splitCellValues = await splitCellRow.locator('td').evaluateAll((cells) =>
    cells.map((cell) => cell.textContent?.toLowerCase() ?? ''),
  );
  expect(splitCellValues.some((cell) => cell.includes('consumer'))).toBe(true);
  expect(splitCellValues.some((cell) => cell.includes('gross'))).toBe(true);
  expect(splitCellValues.some((cell) => cell.includes('consumer gross'))).toBe(false);
  const highlightedTokens = await splitCellRow.locator('mark').allTextContents();
  expect(highlightedTokens.some((token) => token.toLowerCase().includes('consumer'))).toBe(true);
  expect(highlightedTokens.some((token) => token.toLowerCase().includes('gross'))).toBe(true);

  await page.goto('/far/172#172.101');
  const fullTable = page.locator('table').filter({ hasText: '(1) Symbols' });
  const fullTableContainer = fullTable.locator('xpath=../..');
  const firstPageLabel = `Rows 1–25 of ${bodyRowCount}`;
  await expect(fullTableContainer.getByText(firstPageLabel)).toBeVisible();
  await fullTableContainer.getByRole('button', { name: 'Next page' }).click();
  await expect(fullTableContainer.getByText(`Rows 26–50 of ${bodyRowCount}`)).toBeVisible();
  await fullTableContainer.getByRole('button', { name: 'Last page' }).click();
  const lastPageStart = bodyRowCount - ((bodyRowCount - 1) % 25);
  await expect(fullTableContainer.getByText(`Rows ${lastPageStart}–${bodyRowCount} of ${bodyRowCount}`)).toBeVisible();
  await expect(fullTable.getByRole('columnheader')).toHaveCount(14);
  await expect(fullTable.locator('caption')).toContainText('FAR 172.101');
  await expect(fullTable.getByRole('row').last()).toHaveAttribute('aria-rowindex', String(bodyRowCount + 1));
  await expect(fullTableContainer.getByRole('button', { name: 'Next page' })).toBeDisabled();

  await page.setViewportSize({ width: 320, height: 844 });
  const tableScroller = fullTable.locator('xpath=..');
  expect(await tableScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const cellWidths = await fullTable.locator('tbody tr').first().locator('td')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(Math.min(...cellWidths)).toBeGreaterThanOrEqual(120);
  const buttonHeights = await fullTableContainer
    .getByRole('group', { name: 'Table pagination' })
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(buttonHeights.every((height) => height >= 44)).toBe(true);
  expect(errors).toEqual([]);
});

test('keeps complete large-table text available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/far/172#172.101');

  const table = page.locator('table').filter({ hasText: '(1) Symbols' });
  await expect(table.locator('tbody tr')).toHaveCount(25);

  const fallback = page.locator('noscript details').first();
  await expect(fallback).toBeVisible();
  await expect(page.getByRole('group', { name: 'Table pagination' }).first()).toBeHidden();
  await fallback.locator('summary').click();
  await expect(fallback.locator('pre')).toContainText('Zirconium tetrachloride');

  await context.close();
});

test('keeps prerendered table controls disabled until FAR hydration completes', async ({ page }) => {
  let releaseFarPage!: () => void;
  let markFarPageRequested!: () => void;
  const farPageBlocked = new Promise<void>((resolve) => {
    releaseFarPage = resolve;
  });
  const farPageRequested = new Promise<void>((resolve) => {
    markFarPageRequested = resolve;
  });

  await page.route('**/assets/FARPage-*.js', async (route) => {
    markFarPageRequested();
    await farPageBlocked;
    await route.continue();
  });

  try {
    await page.goto('/far/172#172.101');
    const table = page.locator('table').filter({ hasText: '(1) Symbols' });
    const container = table.locator('xpath=../..');
    await expect(table).toBeVisible();
    const bodyRowCount = Number(await table.getAttribute('aria-rowcount')) - 1;
    const nextPage = container.getByRole('button', { name: 'Next page' });

    await farPageRequested;
    await expect(container.getByText(`Rows 1–25 of ${bodyRowCount}`)).toBeVisible();
    await expect(nextPage).toBeDisabled();

    releaseFarPage();
    await expect(nextPage).toBeEnabled();
    await nextPage.click();
    await expect(container.getByText(`Rows 26–50 of ${bodyRowCount}`)).toBeVisible();
  } finally {
    releaseFarPage();
  }
});
