import { test, expect } from '@playwright/test';
import { communityDetailFixture } from './community-publishing-fixtures';

const summary = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title: `Community course ${index}`,
  description: '',
  creatorName: 'Test author',
  createdAt: '2026-11-10T00:00:00.000Z',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }),
  );
});

test('Community supports direct visits, reloads and browser history when playing a map', async ({
  page,
}) => {
  const map = communityDetailFixture(summary(1));
  await page.route('**/api/community', (route) =>
    route.fulfill({ json: { items: [summary(1)], nextCursor: null } }),
  );
  await page.route(`**/api/community/${map.id}`, (route) => route.fulfill({ json: { map } }));
  await page.goto('http://127.0.0.1:3000/community');
  const community = page.getByRole('main', { name: 'Community', exact: true });
  await expect(community.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Community', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.reload();
  await expect(community).toBeVisible();
  await community.getByRole('button', { name: `Play ${map.title}`, exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:3000/?community=${map.id}`);
  await expect(page.locator('#course-title')).toHaveText(map.title);
  await page.goBack();
  await expect(community).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:3000/community');
  await page.goForward();
  await expect(page.locator('#course-title')).toBeVisible();
  await expect(page.locator('#course-title')).toHaveText(map.title);
});

test('Community fills the page, scrolls its cards and preserves the editor draft', async ({
  page,
}) => {
  await page.route('**/api/community', (route) =>
    route.fulfill({
      json: {
        items: Array.from({ length: 20 }, (_, index) => ({
          ...summary(index + 1),
          description: 'Guide the ball to the goal with a few carefully placed force tiles.',
        })),
        nextCursor: null,
      },
    }),
  );
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  const community = page.getByRole('main', { name: 'Community', exact: true });
  await expect(community.getByRole('article')).toHaveCount(20);
  const first = community.getByRole('article').first();
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(240);
  expect((await community.boundingBox())!.width).toBeGreaterThan(1400);
  const firstBox = (await first.boundingBox())!;
  const secondBox = (await community.getByRole('article').nth(1).boundingBox())!;
  expect(secondBox.y).toBe(firstBox.y);
  await community.getByRole('article').last().getByRole('button').scrollIntoViewIfNeeded();
  await expect(community.getByRole('article').last().getByRole('button')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await first.scrollIntoViewIfNeeded();
  expect((await community.getByRole('article').nth(1).boundingBox())!.y).toBeGreaterThan(
    (await first.boundingBox())!.y,
  );
  await community.getByRole('button', { name: 'Create a map', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Level editor', exact: true });
  await expect(editor.getByLabel('Level editing canvas')).toBeVisible();
  await editor.getByLabel('Course name', { exact: true }).fill('Keep my community draft');
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  await expect(community).toBeVisible();
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
    'Keep my community draft',
  );
});

test('a malformed page preserves loaded maps and can be retried without crashing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/community', (route) =>
    route.fulfill({ json: { items: [summary(1)], nextCursor: summary(1).id } }),
  );
  let malformed = true;
  await page.route('**/api/community?*', (route) =>
    route.fulfill({
      json: malformed
        ? { items: null, nextCursor: null }
        : { items: [summary(2)], nextCursor: null },
    }),
  );
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  const panel = page.getByRole('main', { name: 'Community', exact: true });
  await expect(panel.getByRole('article')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Load more maps' }).click();
  await expect(panel.getByRole('alert')).toContainText('Community returned invalid data');
  await expect(panel.getByRole('article')).toHaveCount(1);
  malformed = false;
  await panel.getByRole('button', { name: 'Retry community' }).click();
  await expect(panel.getByRole('article')).toHaveCount(2);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('invalid map rules preserve the selected course until a valid response arrives', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const map = communityDetailFixture(summary(1));
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { player: { id: 'community-reader', nickname: 'Test reader' } } }),
  );
  await page.route('**/api/community', (route) =>
    route.fulfill({ json: { items: [summary(1)], nextCursor: null } }),
  );
  let malformed = true;
  await page.route(`**/api/community/${map.id}`, (route) =>
    route.fulfill({ json: { map: malformed ? { ...map, rules: null } : map } }),
  );
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Play legacy course', exact: true }).click();
  const selectedTitle = await page.locator('#course-title').innerText();
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  const panel = page.getByRole('main', { name: 'Community', exact: true });
  await panel.getByRole('button', { name: `Play ${map.title}`, exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Community returned invalid data. Please retry.' }),
  ).toBeVisible();
  await expect(page.locator('#course-title')).toHaveText(selectedTitle);
  malformed = false;
  await panel.getByRole('button', { name: `Play ${map.title}`, exact: true }).click();
  await expect(page.locator('#course-title')).toHaveText(map.title);
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
