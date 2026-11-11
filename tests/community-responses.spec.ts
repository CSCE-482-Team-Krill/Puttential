import { test, expect } from '@playwright/test';
import { communityPublishingFixture } from './community-publishing-fixtures';
import { defaultRules } from '../src/game/run-evaluation';

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
  const panel = page.getByRole('dialog', { name: 'Community', exact: true });
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
  const { document } = communityPublishingFixture();
  const map = { ...summary(1), configuration: document.level, rules: defaultRules(document.level) };
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
  const panel = page.getByRole('dialog', { name: 'Community', exact: true });
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
