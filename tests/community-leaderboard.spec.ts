import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { communityPublishingFixture } from './community-publishing-fixtures';

test('community play saves a rank, persists after refresh and exposes a working replay', async ({
  page,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires a migrated local test database.');
  const origin = 'http://127.0.0.1:3000';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
  const guest = await page.request.post(`${origin}/api/guest`, {
    headers: { Origin: origin },
    data: {},
  });
  expect(guest.ok()).toBe(true);
  const { player } = await guest.json();
  const publication = await page.request.post(`${origin}/api/community`, {
    headers: { Origin: origin },
    data: {
      ...communityPublishingFixture(),
      requestId: randomUUID(),
      expectedGuestId: player.id,
      title: 'Community leaderboard browser test',
      description: '',
    },
  });
  expect(publication.status(), await publication.text()).toBe(201);
  const { map } = await publication.json();
  await page.goto(`${origin}/?community=${map.id}`);
  await expect(page.locator('#course-title')).toHaveText(map.title);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  const leaderboard = page.getByRole('dialog', { name: 'Leaderboard', exact: true });
  await expect(leaderboard.getByText('Community leaderboard — all-time')).toBeVisible();
  await expect(leaderboard.getByText('No verified results yet.')).toBeVisible();
  await expect(leaderboard.getByLabel('Leaderboard scope')).toHaveCount(0);
  await leaderboard.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const result = page.getByRole('dialog', { name: 'Nice work!', exact: true });
  await expect(
    result.getByRole('status').filter({ hasText: /^Saved and verified\.$/ }),
  ).toBeVisible();
  await result.getByRole('button', { name: 'Copy result', exact: true }).click();
  await expect(result.getByLabel('Result text')).toHaveValue(/Community solved/);
  await expect(result.getByLabel('Result text')).toHaveValue(/Community rank #1/);
  await expect(result.getByLabel('Result text')).toHaveValue(new RegExp(`community=${map.id}`));
  await page.reload();
  await expect(page.locator('#course-title')).toHaveText(map.title);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(leaderboard.getByText('Your rank: #1')).toBeVisible();
  await expect(leaderboard.getByText('1 ranked players')).toBeVisible();
  await expect(leaderboard.getByRole('button', { name: /Watch .* replay/ })).toBeEnabled();
  await leaderboard.getByRole('button', { name: 'Around me', exact: true }).click();
  await expect(leaderboard.getByRole('listitem')).toHaveCount(1);
  await mkdir('artifacts/leaderboard-community', { recursive: true });
  await page.screenshot({
    path: 'artifacts/leaderboard-community/standings-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'artifacts/leaderboard-community/standings-mobile.png',
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const replayResponse = page.waitForResponse((response) => response.url().includes('/replays/'));
  await leaderboard.getByRole('button', { name: /Watch .* replay/ }).click();
  expect((await replayResponse).status()).toBe(200);
  await expect(leaderboard.getByText(/Community best/)).toBeVisible();
  await expect(leaderboard.getByRole('alert')).toHaveCount(0);
  await expect(leaderboard.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
  await leaderboard.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect(
    leaderboard.getByText('Replay complete — verified solution.', { exact: true }),
  ).toBeVisible();
  await leaderboard.getByRole('button', { name: 'Back to standings', exact: true }).click();
  await expect(leaderboard.getByText('Your rank: #1')).toBeVisible();
  expect(errors).toEqual([]);
});
