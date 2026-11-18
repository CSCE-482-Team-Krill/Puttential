import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { openingCourse } from '../src/backend/daily-courses';
import { replayRun, makePlacement } from '../src/game/run-evaluation';
import { centralDateString, shiftDate } from '../src/backend/puzzle-date';
import { decodePuzzle, decodePlayer, decodeRun } from '../src/shared/response-validation';
import { randomUUID } from 'node:crypto';
import type { ReplayResponse } from '../src/shared/puzzle-contracts';
import {
  boardFixture,
  playerFixture,
  progressFixture,
  puzzleFixture,
  acceptedFixture,
} from './iteration-two-fixtures';

const origin = 'http://127.0.0.1:3000';
const artifacts = 'artifacts/replay-viewing';

async function fixtures(page: Page, options: { locked?: boolean; unsupported?: boolean } = {}) {
  const course = openingCourse(0);
  const puzzle = {
    ...puzzleFixture('2026-10-25'),
    configuration: course.level,
    rules: course.rules,
  };
  if (options.unsupported) puzzle.rules = { ...puzzle.rules, simulationVersion: 'obsolete-engine' };
  const evaluation = await replayRun(course.level, course.solutions[0]!, course.rules);
  const replay: ReplayResponse = {
    viewerGuestId: playerFixture.id,
    puzzleId: puzzle.id,
    scope: 'archive',
    player: { id: 'other-player', nickname: 'Replay player' },
    placement: { ...course.solutions[0]!, simulationVersion: puzzle.rules.simulationVersion },
    result: {
      runId: 'other-verified-run',
      ...evaluation,
      verification: 'verified',
      dailyEligible: true,
      savedAt: puzzle.serverNow,
    },
    availability: puzzle.availability,
  };
  const board = {
    ...boardFixture(puzzle),
    scope: 'archive' as const,
    me: null,
    rows: [
      { ...boardFixture(puzzle).rows[0]!, player: replay.player, metrics: evaluation.metrics },
    ],
    replayAccess: {
      available: !options.locked,
      unlocksAt: options.locked ? puzzle.nextDailyAt : '2026-10-26T05:00:00Z',
    },
  };
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 404,
      json: { error: 'Not found', code: 'NOT_FOUND', retryable: false },
    }),
  );
  await page.route('**/api/me', (route) => route.fulfill({ json: { player: playerFixture } }));
  await page.route('**/api/puzzles/today', (route) => route.fulfill({ json: puzzle }));
  await page.route('**/api/me/progress?*', (route) =>
    route.fulfill({
      json: { progress: progressFixture(puzzle), availability: puzzle.availability },
    }),
  );
  await page.route('**/api/puzzles/*/leaderboard?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: { ...board, scope: params.get('scope'), view: params.get('view') },
    });
  });
  await page.route('**/api/puzzles/*/replays/*?*', (route) => {
    const scope = new URL(route.request().url()).searchParams.get('scope');
    return route.fulfill({ json: { ...replay, scope } });
  });
  return { puzzle, replay, board };
}

for (const width of [1500, 320]) {
  test(`spectator controls preserve the viewer's draft and standings at ${width}px`, async ({
    page,
  }) => {
    const { replay } = await fixtures(page);
    await page.setViewportSize({ width, height: width === 320 ? 820 : 1050 });
    const writes: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.url());
    });
    await page.goto(origin);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.locator('.tile-option').first().click();
    await page.getByLabel('Selected tile X', { exact: true }).fill('-4.25');
    await expect(page.getByLabel('Selected tile X', { exact: true })).toHaveValue('-4.25');
    const drafts = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.keys(localStorage)
            .filter((key) => key.startsWith('puttential-draft-'))
            .map((key) => [key, localStorage.getItem(key)]),
        ),
      );
    const before = await drafts();
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    const leaderboardDialog = page.locator('.modal-leaderboard');
    await expect(page.getByRole('dialog', { name: 'Leaderboard', exact: true })).toBeVisible();
    const watch = page.getByRole('button', { name: 'Watch Replay player’s replay' });
    await expect(watch).toBeEnabled();
    if (width === 1500) {
      const [paginationBox, controlsBox, pageSizeBox] = await Promise.all([
        page.getByRole('navigation', { name: 'Leaderboard pages' }).boundingBox(),
        page.locator('.leaderboard-page-controls').boundingBox(),
        page.getByLabel('Rows per leaderboard page').locator('..').boundingBox(),
      ]);
      expect(
        Math.abs(
          controlsBox!.x + controlsBox!.width / 2 - (paginationBox!.x + paginationBox!.width / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          pageSizeBox!.y + pageSizeBox!.height / 2 - (controlsBox!.y + controlsBox!.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(pageSizeBox!.x + pageSizeBox!.width - (paginationBox!.x + paginationBox!.width)),
      ).toBeLessThanOrEqual(1);
    }
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/standings-${width}.png`, fullPage: true });
    await watch.click();
    const replayDialog = page.getByRole('dialog', { name: 'Replay', exact: true });
    await expect(replayDialog).toBeVisible();
    await expect(page.locator('.modal')).toHaveCount(2);
    await expect(leaderboardDialog).toHaveAttribute('aria-hidden', 'true');
    await expect(leaderboardDialog).toHaveAttribute('inert', '');
    await expect(page.getByRole('heading', { name: 'Replay player’s solution' })).toBeFocused();
    await expect(replayDialog.getByText('October 25, 2026', { exact: true })).toBeVisible();
    await expect(replayDialog.getByRole('table')).toContainText('Replay player');
    await expect(replayDialog.getByRole('button', { name: 'Back to standings' })).toHaveCount(0);
    await expect(replayDialog).not.toContainText('Archive best');
    await expect(replayDialog).not.toContainText('Read-only replay');
    if (width === 1500) {
      const costHelp = page.getByRole('tooltip').filter({
        hasText: 'Total force cost. Lower values rank better.',
      });
      await expect(costHelp).toBeHidden();
      await replayDialog.getByLabel('Cost', { exact: true }).hover();
      await expect(costHelp).toBeVisible();
    }
    const course = page.locator('.replay-course');
    const controls = page.locator('.replay-controls');
    const fullscreenButton = page.getByRole('button', { name: 'Fullscreen replay', exact: true });
    const [courseBox, controlsBox, fullscreenBox] = await Promise.all([
      course.boundingBox(),
      controls.boundingBox(),
      fullscreenButton.boundingBox(),
    ]);
    expect(fullscreenBox!.x).toBeGreaterThan(courseBox!.x);
    expect(fullscreenBox!.x + fullscreenBox!.width).toBeLessThanOrEqual(
      courseBox!.x + courseBox!.width,
    );
    if (width === 1500) {
      expect(controlsBox!.x + controlsBox!.width).toBeLessThan(courseBox!.x);
      expect(courseBox!.height).toBeGreaterThanOrEqual(480);
    } else {
      expect(controlsBox!.y).toBeGreaterThan(courseBox!.y + courseBox!.height);
    }
    const play = page.getByRole('button', { name: 'Play replay', exact: true });
    await expect(play).toBeEnabled();
    const elapsed = page.getByLabel('Replay elapsed time');
    const timeline = page.getByRole('slider', { name: 'Replay timeline' });
    await expect(elapsed).toContainText('0.00s /');
    await expect(timeline).toHaveValue('0');
    await expect(timeline).toHaveAccessibleDescription(
      'Gold segments show when the ball is inside the flag area.',
    );
    const goalIntervals = page.locator('.replay-goal-interval');
    await expect(goalIntervals.first()).toBeVisible();
    const goalIntervalCount = await goalIntervals.count();
    await page.getByRole('radio', { name: '0.5×', exact: true }).check();
    await play.click();
    await expect.poll(() => elapsed.textContent()).not.toMatch(/^0\.00s/);
    await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause replay' }).click();
    const paused = await elapsed.textContent();
    await page.waitForTimeout(150);
    await expect(elapsed).toHaveText(paused!);
    // Refreshing immutable course metadata on focus must preserve the spectator world.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(150);
    await expect(elapsed).toHaveText(paused!);
    const courseHeight = await page.locator('.replay-course').evaluate((el) => el.clientHeight);
    await fullscreenButton.click();
    await expect
      .poll(() =>
        page.evaluate(() => document.fullscreenElement?.classList.contains('replay-player')),
      )
      .toBe(true);
    const exitFullscreen = page.getByRole('button', { name: 'Exit fullscreen', exact: true });
    await expect(exitFullscreen).toHaveAttribute('aria-pressed', 'true');
    await expect(elapsed).toHaveText(paused!);
    await expect(page.getByRole('radio', { name: '0.5×', exact: true })).toBeChecked();
    await expect
      .poll(() => page.locator('.replay-course').evaluate((el) => el.clientHeight))
      .toBeGreaterThan(courseHeight);
    await page.keyboard.press('Tab');
    await expect(play).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(exitFullscreen).toBeFocused();
    await page.screenshot({ path: `${artifacts}/replay-fullscreen-${width}.png` });
    await exitFullscreen.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Fullscreen replay', exact: true }),
    ).toBeFocused();
    await expect(elapsed).toHaveText(paused!);
    // The browser can also exit fullscreen independently of the viewer's button.
    await page.getByRole('button', { name: 'Fullscreen replay', exact: true }).click();
    await expect(exitFullscreen).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.evaluate(() => document.exitFullscreen());
    await expect(
      page.getByRole('button', { name: 'Fullscreen replay', exact: true }),
    ).toBeVisible();
    const midpoint = Math.floor(replay.result.metrics!.completionTick / 2);
    await timeline.fill(String(midpoint));
    await expect(timeline).toHaveValue(String(midpoint));
    await expect(elapsed).toContainText(`${(midpoint * (1 / 120)).toFixed(2)}s /`);
    await expect(timeline).toHaveAttribute(
      'aria-valuetext',
      `${(midpoint * (1 / 120)).toFixed(2)} seconds of ${(replay.result.metrics!.completionTick * (1 / 120)).toFixed(2)} seconds`,
    );
    await timeline.fill('0');
    await expect(elapsed).toContainText('0.00s /');
    await expect(goalIntervals).toHaveCount(goalIntervalCount);
    await page.getByRole('button', { name: 'Restart replay' }).click();
    await expect(elapsed).toContainText('0.00s /');
    await expect(page.getByRole('radio', { name: '0.5×', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: '2×', exact: true }).check();
    await expect(page.getByRole('radio', { name: '2×', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: '4×', exact: true }).check();
    await play.click();
    await expect(play).toBeDisabled({ timeout: 20000 });
    await expect(replayDialog).not.toContainText('Replay complete');
    expect(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `${artifacts}/replay-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close replay' }).click();
    await expect(replayDialog).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Leaderboard', exact: true })).toBeVisible();
    await expect(leaderboardDialog).not.toHaveAttribute('inert', '');
    await expect(watch).toBeFocused();
    await expect(page.getByRole('radio', { name: 'All-time', exact: true })).toBeChecked();
    await watch.click();
    await expect(play).toBeEnabled();
    await expect(elapsed).toContainText('0.00s /');
    await page.keyboard.press('Escape');
    await expect(replayDialog).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Leaderboard', exact: true })).toBeVisible();
    await expect(watch).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Selected tile X', { exact: true })).toHaveValue('-4.25');
    expect(await drafts()).toEqual(before);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('locked entries use a closed eye and a foreground refresh unlocks replays', async ({
  page,
}) => {
  const { board } = await fixtures(page, { locked: true });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  const watch = page.getByRole('button', { name: 'Replay player’s replay is unavailable' });
  await expect(watch).toBeDisabled();
  await expect(watch.locator('circle')).toHaveCount(0);
  await expect(page.getByRole('dialog')).not.toContainText('Replays unlock after daily close');
  board.replayAccess.available = true;
  board.replayAccess.unlocksAt = '2026-10-26T05:00:00Z';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const unlocked = page.getByRole('button', { name: 'Watch Replay player’s replay' });
  await expect(unlocked).toBeEnabled();
  await expect(unlocked.locator('circle')).toHaveCount(1);
});

test('failed replay reads can be retried, and a newer best uses response metrics', async ({
  page,
}) => {
  const { replay, board } = await fixtures(page);
  board.rows[0]!.metrics = { ...board.rows[0]!.metrics, forceCost: 99 };
  let calls = 0;
  await page.route('**/api/puzzles/*/replays/*?*', (route) =>
    ++calls === 1
      ? route.fulfill({
          status: 404,
          json: {
            error: 'No verified solution is available.',
            code: 'NOT_FOUND',
            retryable: false,
          },
        })
      : route.fulfill({ json: replay }),
  );
  await page.goto(origin);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await page.getByRole('button', { name: 'Watch Replay player’s replay' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No verified solution');
  await page.getByRole('button', { name: 'Retry replay' }).click();
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
  await expect(page.locator('.replay-summary tbody tr > td').nth(1)).toHaveText(
    String(replay.result.metrics!.forceCost),
  );
  await expect(page.locator('.replay-summary tbody tr > td').nth(1)).not.toHaveText('99');
  expect(calls).toBe(2);
});

test('unsupported replay engines explain unavailability', async ({ page }) => {
  await fixtures(page, { unsupported: true });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await page.getByRole('button', { name: 'Watch Replay player’s replay' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'engine version that is unavailable',
  );
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toHaveCount(0);
});

test('hiding the document pauses playback and returning preserves elapsed time', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await page.getByRole('button', { name: 'Watch Replay player’s replay' }).click();
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  const elapsed = page.getByLabel('Replay elapsed time');
  await expect.poll(() => elapsed.textContent()).not.toMatch(/^0\.00s/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
  const paused = await elapsed.textContent();
  await page.waitForTimeout(150);
  await expect(elapsed).toHaveText(paused!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(150);
  await expect(elapsed).toHaveText(paused!);
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
});

test('closing a loading replay discards its late response', async ({ page }) => {
  const { replay } = await fixtures(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/puzzles/*/replays/*?*', async (route) => {
    if (++calls === 1) await gate;
    await route.fulfill({ json: replay }).catch(() => {});
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await page.getByRole('button', { name: 'Watch Replay player’s replay' }).click();
  const replayDialog = page.getByRole('dialog', { name: 'Replay', exact: true });
  await expect(page.getByText('Loading replay…', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  release();
  await expect(replayDialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Leaderboard', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Watch Replay player’s replay' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Watch Replay player’s replay' }).click();
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
});

test('replay entry stays disabled while the viewer has a running attempt', async ({ page }) => {
  const { puzzle } = await fixtures(page);
  await page.route('**/api/runs', async (route) => {
    const start = route.request().postDataJSON();
    await route.fulfill({ json: acceptedFixture(start, puzzle) });
  });
  await page.goto(origin);
  await page.locator('.tile-option').first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Watch Replay player’s replay' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Finish or stop your current run');
});

test('real two-guest replay flows from a verified PostgreSQL run into browser playback', async ({
  browser,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires the designated local acceptance database.');
  const source = await browser.newContext();
  const viewer = await browser.newContext();
  try {
    const guestResponse = await source.request.post(`${origin}/api/guest`, {
      headers: { Origin: origin },
      data: {},
    });
    expect(guestResponse.ok()).toBe(true);
    const owner = decodePlayer(await guestResponse.json()).player;
    // APIRequestContext omits Secure cookies over local HTTP when testing a production build.
    // Forward this test guest's opaque cookie explicitly; browser requests use their normal cookie jar.
    const ownerHeaders = {
      Origin: origin,
      Cookie: guestResponse.headers()['set-cookie']!.split(';')[0]!,
    };
    const renamed = await source.request.patch(`${origin}/api/me`, {
      headers: ownerHeaders,
      data: { expectedGuestId: owner.id, nickname: 'Live replay source' },
    });
    expect(renamed.ok()).toBe(true);
    const date = shiftDate(centralDateString(), -1);
    const puzzle = decodePuzzle(
      await (await source.request.get(`${origin}/api/puzzles/by-date/${date}`)).json(),
    );
    const placement = makePlacement(
      puzzle.configuration,
      Object.fromEntries(
        puzzle.configuration.fields.map((field) => [
          field.id,
          {
            position: field.position,
            angle: field.angle,
            enabled: field.id === 'gentle-push',
          },
        ]),
      ),
      puzzle.rules,
    );
    const startedResponse = await source.request.post(`${origin}/api/runs`, {
      headers: ownerHeaders,
      data: { expectedGuestId: owner.id, requestId: randomUUID(), puzzleId: puzzle.id, placement },
    });
    expect(startedResponse.ok()).toBe(true);
    const accepted = decodeRun(await startedResponse.json());
    const completedResponse = await source.request.post(
      `${origin}/api/runs/${accepted.runId}/complete`,
      {
        headers: ownerHeaders,
        data: { expectedGuestId: owner.id, kind: 'terminal' },
      },
    );
    expect(completedResponse.ok()).toBe(true);
    const saved = decodeRun(await completedResponse.json());
    expect(saved.state).toBe('saved');
    if (saved.state !== 'saved') throw new Error('Verification did not finish.');
    expect(saved.result.outcome).toBe('success');
    const page = await viewer.newPage();
    const writes: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/runs') && request.method() !== 'GET')
        writes.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/?date=${date}`);
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await page
      .getByRole('button', { name: 'Watch Live replay source’s replay', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
    await page.getByRole('radio', { name: '2×', exact: true }).check();
    await page.getByRole('button', { name: 'Play replay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeDisabled({
      timeout: 20000,
    });
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/replay-live-two-guests.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close replay' }).click();
    await expect(page.getByRole('dialog')).toContainText('Solve this course to get a rank.');
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await source.close();
    await viewer.close();
  }
});
