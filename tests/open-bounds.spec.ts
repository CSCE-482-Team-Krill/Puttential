import { test, expect } from '@playwright/test';
import { freshDocument, edit } from '../level-editor/editor/model';
import { setLevelBorders } from '../src/game';

test('Level borders toggle removes/restores walls, keeps board dimensions, and supports undo', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:3001');
  const borders = page.getByRole('checkbox', { name: 'Level borders', exact: true });
  const list = page.locator('.object-list');
  await expect(borders).toBeChecked();
  await page.screenshot({ path: '/tmp/puttential-borders-on.png', fullPage: true });
  await borders.uncheck();
  await expect(
    list.getByRole('button', { name: /left-rail|right-rail|bottom-rail|top-rail/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Board width', exact: true })).toHaveValue(
    '14.8',
  );
  await expect(page.getByRole('spinbutton', { name: 'Board height', exact: true })).toHaveValue(
    '8.5',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(borders).toBeChecked();
  await expect(
    list.getByRole('button', { name: /left-rail|right-rail|bottom-rail|top-rail/ }),
  ).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(borders).not.toBeChecked();
  await borders.check();
  await expect(
    list.getByRole('button', { name: /left-rail|right-rail|bottom-rail|top-rail/ }),
  ).toHaveCount(4);
  await borders.uncheck();
  const width = page.getByRole('spinbutton', { name: 'Board width', exact: true });
  await width.fill('20');
  await width.press('Tab');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('puttential-editor-v1')!).level.bounds),
    )
    .toEqual({ minX: -10, maxX: 10, minY: -4.25, maxY: 4.25 });
  await page.screenshot({ path: '/tmp/puttential-borders-off.png', fullPage: true });
  await testInfo.attach('Borders enabled', {
    path: '/tmp/puttential-borders-on.png',
    contentType: 'image/png',
  });
  await testInfo.attach('Borders disabled', {
    path: '/tmp/puttential-borders-off.png',
    contentType: 'image/png',
  });
});

test('open editor course fails only after a moving ball completely exits, and returning preserves border settings', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:3001');
  await page.getByRole('checkbox', { name: 'Level borders', exact: true }).uncheck();
  await page.locator('.object-list').getByRole('button', { name: 'ball', exact: true }).click();
  for (const [name, value] of [
    ['Position X', '6'],
    ['Initial velocity X', '8'],
  ]) {
    const input = page.getByRole('spinbutton', { name: name!, exact: true });
    await input.fill(value!);
    await input.press('Tab');
  }
  await page.getByRole('button', { name: 'Playtest', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('An object left the course');
  await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Level borders', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('6');
});

test('daily game shares the out-of-bounds failure and records an unsuccessful run', async ({
  page,
}) => {
  const doc = edit(setLevelBorders(freshDocument(), false), (d) => {
    d.level.dynamicBodies[0]!.position.x = 6;
    d.level.dynamicBodies[0]!.linearVelocity = { x: 8, y: 0 };
  });
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/api/puzzles/today', (route) =>
    route.fulfill({
      json: {
        id: 'open-board-test',
        date: '2026-10-21',
        seed: 'open-board',
        difficulty: 1,
        configuration: doc.level,
      },
    }),
  );
  await page.route('**/api/attempts', async (route) => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { attemptId: 'open-board-attempt' } });
  });
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'So close', exact: true })).toContainText(
    'An object left the course',
  );
  await expect.poll(() => attempts.length).toBe(1);
  expect(attempts[0]!.success).toBe(false);
});
