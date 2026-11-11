import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('puttential-tutorial-v1', 'seen');
  });
  await context.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { error: 'Unavailable fixture' } }),
  );
});

test('Editor stays in the website and preserves game and authoring state across tabs', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Play legacy course', exact: true }).click();
  const game = page.locator('main.dashboard');
  const title = await game.locator('h1').innerText();
  await mkdir('artifacts/editor-tab', { recursive: true });
  await page.screenshot({ path: 'artifacts/editor-tab/game.png' });
  const editorTab = page.getByRole('button', { name: 'Editor', exact: true });
  await editorTab.click();
  const editor = page.getByRole('region', { name: 'Level editor', exact: true });
  await expect(editor).toBeVisible();
  await expect(game).toBeHidden();
  await expect(editorTab).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByLabel('Level editing canvas')).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  expect(page.url()).toBe('http://127.0.0.1:3000/');
  await editor.getByLabel('Level ID / filename', { exact: true }).fill('website-editor-check');
  await editor.getByLabel('Course name', { exact: true }).fill('Website editor check');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor).toContainText('Saved on this device');
  await expect(editor.getByLabel('My drafts')).toContainText('website-editor-check');
  await page.screenshot({ path: 'artifacts/editor-tab/editor-desktop.png' });

  await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Return to editor', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Return to editor', exact: true }).click();
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
    'Website editor check',
  );
  const download = page.waitForEvent('download');
  await editor.getByRole('button', { name: 'Export JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('website-editor-check.json');
  await editor.getByRole('button', { name: 'Back to game', exact: true }).click();
  await expect(game).toBeVisible();
  await expect(game.locator('h1')).toHaveText(title);
  await expect(editorTab).toHaveAttribute('aria-pressed', 'false');
  // Authoring shortcuts must be inactive while playing the game.
  await page.keyboard.press('Control+z');
  await editorTab.click();
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
    'Website editor check',
  );

  await page.reload();
  await editorTab.click();
  await expect(editor).toContainText('A browser recovery draft is available');
  await editor.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
    'Website editor check',
  );
  await editor.getByLabel('Course name', { exact: true }).fill('Recovered website course');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor).toContainText('Saved on this device');
  // Reopen the saved course from the device library.
  await editor.getByLabel('My drafts').selectOption('website-editor-check');
  await editor.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(editor).toContainText('Saved on this device');
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
    'Recovered website course',
  );
  expect(errors).toEqual([]);
});

test('Editor fits a phone viewport and preserves modal keyboard behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Level editor', exact: true });
  await expect(editor.getByLabel('Level editing canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('artifacts/editor-tab', { recursive: true });
  await page.screenshot({ path: 'artifacts/editor-tab/editor-mobile.png' });
  const community = page.getByRole('button', { name: 'Community', exact: true });
  await community.click();
  await expect(page.getByRole('dialog', { name: 'Community', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(community).toBeFocused();
  await expect(editor).toBeVisible();
});

test('community retries repeat the failed page, including a failed refresh', async ({ page }) => {
  const map = (index: number) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Community course ${index}`,
    description: '',
    creatorName: 'Test creator',
    createdAt: '2026-11-09T00:00:00.000Z',
  });
  const firstCursor = map(20).id,
    secondCursor = map(21).id;
  let failMore = true,
    failRefresh = false;
  const requests: string[] = [];
  await page.route('**/api/community?*', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    requests.push(cursor!);
    if (failMore) {
      failMore = false;
      await route.fulfill({ status: 503, json: { error: 'Temporary page failure' } });
    } else await route.fulfill({ json: { items: [map(21)], nextCursor: secondCursor } });
  });
  await page.route('**/api/community', async (route) => {
    requests.push('first');
    if (failRefresh) {
      failRefresh = false;
      await route.fulfill({ status: 503, json: { error: 'Temporary refresh failure' } });
    } else
      await route.fulfill({
        json: { items: Array.from({ length: 20 }, (_, i) => map(i + 1)), nextCursor: firstCursor },
      });
  });
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Community', exact: true });
  await expect(panel.getByRole('article')).toHaveCount(20);
  await panel.getByRole('button', { name: 'Load more maps' }).click();
  await panel.getByRole('button', { name: 'Retry community' }).click();
  await expect(panel.getByRole('article')).toHaveCount(21);
  expect(requests.slice(-2)).toEqual([firstCursor, firstCursor]);
  failRefresh = true;
  await panel.getByRole('button', { name: 'Refresh maps' }).click();
  await panel.getByRole('button', { name: 'Retry community' }).click();
  await expect(panel.getByRole('article')).toHaveCount(20);
  expect(requests.slice(-2)).toEqual(['first', 'first']);
});
