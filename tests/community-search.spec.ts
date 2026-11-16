import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const summary = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title: `Valley course ${index}`,
  description: 'Guide the ball through the valley with carefully placed force tiles.',
  creatorName: 'Map maker',
  createdAt: '2026-11-10T00:00:00.000Z',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }),
  );
});

test('combined filters survive pagination, retries and refresh, and clear back to all maps', async ({
  page,
}) => {
  const requests: URLSearchParams[] = [];
  let failNextPage = true;
  await page.route(/\/api\/community(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    if (!params.has('q')) return route.fulfill({ json: { items: [summary(1)], nextCursor: null } });
    if (params.has('cursor') && failNextPage) {
      failNextPage = false;
      return route.fulfill({ status: 503, json: { error: 'Please retry this search.' } });
    }
    return route.fulfill({
      json: params.has('cursor')
        ? { items: [summary(3)], nextCursor: null }
        : { items: [summary(2)], nextCursor: summary(2).id },
    });
  });
  await page.goto('http://127.0.0.1:3000/community');
  await expect(page.getByRole('article')).toHaveCount(1);
  requests.length = 0;
  await page.getByLabel('Search maps', { exact: true }).fill('valley');
  await page.getByLabel('Creator', { exact: true }).fill('maker');
  await page.getByLabel('Published', { exact: true }).selectOption('week');
  await page.getByLabel('Sort by', { exact: true }).selectOption('title');
  // Editing a form does not silently replace the current results.
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('article').first()).toContainText(summary(2).title);
  await page.getByRole('button', { name: 'Load more maps' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Please retry this search.',
  );
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Retry community' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Refresh maps' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  for (const params of requests) {
    expect(params.get('q')).toBe('valley');
    expect(params.get('creator')).toBe('maker');
    expect(params.get('published')).toBe('week');
    expect(params.get('sort')).toBe('title');
  }
  expect(requests[1]!.get('cursor')).toBe(summary(2).id);
  expect(requests[2]!.get('cursor')).toBe(summary(2).id);
  expect(requests[3]!.has('cursor')).toBe(false);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article').first()).toContainText(summary(1).title);
  expect(requests.at(-1)!.size).toBe(0);
  await expect(page.getByLabel('Search maps', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Creator', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Published', { exact: true })).toHaveValue('all');
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('newest');
});

test('a newer search wins over an unfinished request and empty results offer a reset', async ({
  page,
}) => {
  let releaseOldSearch: (() => void) | undefined;
  await page.route(/\/api\/community(?:\?.*)?$/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('q') === 'slow') {
      await new Promise<void>((resolve) => {
        releaseOldSearch = resolve;
      });
      await route.fulfill({ json: { items: [summary(2)], nextCursor: summary(2).id } });
      return;
    }
    await route.fulfill({
      json: { items: params.has('q') ? [] : [summary(1)], nextCursor: null },
    });
  });
  await page.goto('http://127.0.0.1:3000/community');
  await expect(page.getByRole('article')).toHaveCount(1);
  const search = page.getByLabel('Search maps', { exact: true });
  await search.fill('slow');
  await search.press('Enter');
  await expect.poll(() => Boolean(releaseOldSearch)).toBe(true);
  await search.fill('no match');
  await search.press('Enter');
  await expect(
    page.getByText('No maps match your search and filters.', { exact: false }),
  ).toBeVisible();
  releaseOldSearch!();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').first()).toContainText(summary(1).title);
  await expect(page.getByRole('button', { name: 'Load more maps' })).toHaveCount(0);
});

test('search controls fit desktop and mobile layouts', async ({ page }) => {
  await page.route(/\/api\/community(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [summary(1), summary(2), summary(3)], nextCursor: null } }),
  );
  await page.goto('http://127.0.0.1:3000/community');
  await expect(page.getByRole('article')).toHaveCount(3);
  await mkdir('artifacts/community-search', { recursive: true });
  await page.screenshot({ path: 'artifacts/community-search/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Search maps', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/community-search/mobile.png', fullPage: true });
});
