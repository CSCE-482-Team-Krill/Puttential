import { test, expect } from '@playwright/test';
import {
  boardFixture,
  playerFixture,
  progressFixture,
  puzzleFixture,
} from './iteration-two-fixtures';

test('leaderboard waits for the selected archive course instead of being closed by its late load', async ({
  page,
}) => {
  const today = puzzleFixture(),
    archive = puzzleFixture('2026-10-25');
  archive.title = 'Selected archive course';
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 404,
      json: { error: 'Fixture endpoint unavailable', code: 'NOT_FOUND', retryable: false },
    }),
  );
  await page.route('**/api/me', (route) => route.fulfill({ json: { player: playerFixture } }));
  await page.route('**/api/puzzles/today', (route) => route.fulfill({ json: today }));
  await page.route('**/api/puzzles/by-date/2026-10-25', async (route) => {
    await delayed;
    await route.fulfill({ json: archive });
  });
  await page.route('**/api/me/progress?*', (route) =>
    route.fulfill({
      json: { progress: progressFixture(archive), availability: archive.availability },
    }),
  );
  await page.route('**/api/puzzles/*/leaderboard?*', (route) =>
    route.fulfill({ json: { ...boardFixture(archive), scope: 'archive' } }),
  );
  await page.goto('http://127.0.0.1:3000/?date=2026-10-25');
  const button = page.getByRole('button', { name: 'Leaderboard', exact: true });
  await expect(button).toBeDisabled();
  release();
  await expect(page.getByRole('heading', { name: archive.title, exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Leaderboard', exact: true })).toBeVisible();
  await expect(page.getByLabel('Leaderboard scope')).toHaveValue('archive');
  await expect(page.getByRole('dialog')).toContainText('ranked players');
});
