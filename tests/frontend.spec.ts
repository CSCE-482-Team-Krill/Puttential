import { test, expect } from '@playwright/test';
import { starterLevels } from '../src/game/levels/starters';

test('migrated Figma modals retain focus, keyboard controls and preferences', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/modal-preview');
  for (const [button, title] of [
    ['Help', 'Help'],
    ['Profile', 'Profile'],
    ['Leaderboard', 'Leaderboard'],
    ['Calendar', 'Calendar'],
    ['Settings', 'Settings'],
  ]) {
    const trigger = page.getByRole('button', { name: button!, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: title! });
    await expect(dialog).toBeVisible();
    if (button === 'Settings') {
      await dialog.getByRole('switch', { name: 'Reduced motion' }).click();
      await expect(page.locator('.site-wrap')).toHaveClass(/reduce-motion/);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.reload();
  await expect(page.locator('.site-wrap')).toHaveClass(/reduce-motion/);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByText('How to play', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Press Play');
  await page.keyboard.press('Escape');
  for (const width of [320, 390, 700, 760, 850, 1050, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const brand = (await page.locator('.brand').boundingBox())!;
    const nav = (await page.getByRole('navigation').boundingBox())!;
    const header = await page.locator('.site-header').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { right: bounds.right, padding: parseFloat(getComputedStyle(element).paddingRight) };
    });
    expect(nav.x).toBeGreaterThanOrEqual(brand.x + brand.width);
    expect(Math.abs(nav.y + nav.height / 2 - (brand.y + brand.height / 2))).toBeLessThan(2);
    expect(Math.abs(nav.x + nav.width - (header.right - header.padding - 1))).toBeLessThan(2);
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
  }
});

test('daily course loads from the API and saves the locked successful replay once', async ({
  page,
}) => {
  const level = {
    ...starterLevels[0]!,
    id: 'daily-integration-check',
    goal: { bodyId: 'bar', minX: -6, maxX: -3, minY: 0, maxY: 3, holdSeconds: 0.025 },
  };
  const attempts: Record<string, unknown>[] = [];
  const solutions: Record<string, unknown>[] = [];
  await page.route('**/api/puzzles/today', (route) =>
    route.fulfill({
      json: {
        id: 'database-puzzle-id',
        date: '2026-10-15',
        seed: 'daily',
        difficulty: 1,
        configuration: level,
      },
    }),
  );
  await page.route('**/api/attempts', async (route) => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { attemptId: 'new-attempt-id' } });
  });
  await page.route('**/api/solutions', async (route) => {
    solutions.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { solutionId: 'new-solution-id' } });
  });
  await page.goto('http://127.0.0.1:3000');
  await expect(page.getByRole('heading', { name: 'Daily Integration Check' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nice work!' })).toBeVisible();
  await expect(page.getByText('Attempt and solution saved.', { exact: true })).toBeVisible();
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    puzzleId: 'database-puzzle-id',
    success: true,
    tileCount: 0,
    forceCost: 0,
  });
  expect(solutions).toHaveLength(1);
  expect(solutions[0]).toMatchObject({
    puzzleId: 'database-puzzle-id',
    attemptId: 'new-attempt-id',
    placementData: { levelId: level.id, levelVersion: level.version },
  });
  const placement = solutions[0]!.placementData as { commands: unknown[] };
  expect(placement.commands).toHaveLength(level.fields.length * 2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(attempts).toHaveLength(1);
});

test('unavailable daily backend offers practice without submitting it', async ({ page }) => {
  let submissions = 0;
  await page.route('**/api/puzzles/today', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Daily course unavailable.' },
    }),
  );
  await page.route('**/api/attempts', (route) => {
    submissions++;
    return route.fulfill({ status: 500 });
  });
  await page.goto('http://127.0.0.1:3000');
  await expect(page.getByText(/You can play a practice course below/)).toBeVisible();
  await expect(page.locator('.challenge-label')).toContainText('Practice challenge');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'So close' })).toBeVisible();
  expect(submissions).toBe(0);
});
