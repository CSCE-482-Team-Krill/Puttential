import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  boardFixture,
  playerFixture,
  progressFixture,
  puzzleFixture,
  savedFixture,
  startFixture,
  acceptedFixture,
} from './iteration-two-fixtures';
const BASE_URL = 'http://127.0.0.1:3000';
const artifacts = 'artifacts/iteration-two';
async function fixtures(page: Page, p = puzzleFixture()) {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 404,
      json: { error: 'Fixture endpoint unavailable', code: 'NOT_FOUND', retryable: false },
    }),
  );
  await page.route('**/api/me', (route) => route.fulfill({ json: { player: playerFixture } }));
  await page.route('**/api/puzzles/today', (route) => route.fulfill({ json: p }));
  await page.route('**/api/me/progress?*', (route) =>
    route.fulfill({ json: { progress: progressFixture(p), availability: p.availability } }),
  );
  return p;
}
test('calendar year controls cross partial boundary years', async ({ page }) => {
  const december = {
    ...puzzleFixture('2026-12-31'),
    todayDate: '2026-12-31',
    serverNow: '2026-12-31T17:00:00Z',
    nextDailyAt: '2027-01-01T06:00:00Z',
  };
  await fixtures(page, december);
  await page.route('**/api/puzzles?*', (route) =>
    route.fulfill({
      json: { guestId: playerFixture.id, items: [], nextCursor: null },
    }),
  );
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const calendar = page.getByRole('dialog');
  await expect(calendar.getByLabel('Calendar month')).toHaveValue('11');
  await expect(calendar.getByLabel('Calendar year')).toHaveValue('2026');
  await expect(calendar.getByRole('button', { name: 'Next year' })).toBeEnabled();
  await calendar.getByRole('button', { name: 'Next year' }).click();
  await expect(calendar.getByLabel('Calendar month')).toHaveValue('1');
  await expect(calendar.getByLabel('Calendar year')).toHaveValue('2027');
  await expect(calendar.getByRole('button', { name: 'Next month' })).toBeDisabled();
  await expect(calendar.getByRole('button', { name: 'Next year' })).toBeDisabled();
  await calendar.getByRole('button', { name: 'Previous year' }).click();
  await expect(calendar.getByLabel('Calendar month')).toHaveValue('9');
  await expect(calendar.getByLabel('Calendar year')).toHaveValue('2026');
  await expect(calendar.getByRole('button', { name: 'Previous year' })).toBeDisabled();
});
test('published costs, unsupported engine, truthful guest profile and responsive panel evidence', async ({
  page,
}) => {
  await mkdir(artifacts, { recursive: true });
  const p = await fixtures(page);
  let starts = 0;
  await page.route('**/api/runs', (route) => {
    starts++;
    return route.fulfill({ status: 503 });
  });
  await page.goto(BASE_URL);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.locator('.api-notice')).toContainText('Unavailable in this version');
  await expect(page.locator('.tile-cost')).toHaveText(['1 pt', '4 pt']);
  await page.locator('.tile-option').first().click();
  await page.locator('.tile-option').last().click();
  await expect(page.locator('.toolkit-note')).toContainText('Force cost 5');
  await expect(page.getByLabel('Selected tile angle')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Rotate (left|right)$/ })).toHaveCount(0);
  await page.getByLabel('Selected tile X', { exact: true }).fill('2');
  await expect(page.getByLabel('Selected tile X', { exact: true })).toHaveValue('2');
  const saved = savedFixture();
  await page.route('**/api/me/progress?*', (route) =>
    route.fulfill({ json: { progress: saved.progress, availability: p.availability } }),
  );
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('session cookie');
  await expect(page.getByRole('dialog').getByLabel('Nickname')).toHaveValue(playerFixture.nickname);
  await page.keyboard.press('Escape');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `${artifacts}/${width === 320 ? 'mobile' : 'desktop'}-after.png`,
      fullPage: true,
    });
  }
  expect(starts).toBe(0);
});
test('archive reads summaries, paginates, opens date links and retains canvas on same-content refresh', async ({
  page,
}) => {
  const p = await fixtures(page);
  const dates = ['2026-10-25', '2026-10-24', '2026-10-23'];
  const puzzles = dates.map((date) => puzzleFixture(date));
  let calendarGate: Promise<void> | null = null;
  await page.route('**/api/puzzles?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const cursor = params.get('cursor');
    if (params.get('month') === '2026-12' && calendarGate) await calendarGate;
    const courses = cursor ? puzzles.slice(2) : puzzles.slice(0, 2);
    await route.fulfill({
      json: {
        guestId: playerFixture.id,
        items: courses.map((v, i) => ({
          id: v.id,
          date: v.date,
          title: `Historical ${v.date}`,
          difficulty: 1,
          status: i ? 'attempted' : 'solved',
          progressRevision: '0',
          // The solved course has both standings; attempted courses have none.
          dailyRank: i ? null : 2,
          dailyPlayers: i ? null : 10,
          dailyPercentile: i ? null : 80,
          archiveRank: i ? null : 3,
          archivePlayers: i ? null : 12,
          archivePercentile: i ? null : 75,
          availability: v.availability,
        })),
        nextCursor: cursor ? null : 'next-page',
      },
    });
  });
  await page.route('**/api/puzzles/by-date/*', (route) => {
    const date = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return route.fulfill({ json: date === p.date ? p : puzzleFixture(date) });
  });
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const calendar = page.getByRole('dialog');
  await expect(calendar).not.toContainText('Daily archive');
  await expect(calendar.locator('.calendar-day')).toHaveCount(42);
  const weekdayCenters = await calendar.locator('.calendar-weekday').evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.x + bounds.width / 2;
    }),
  );
  const firstWeekCenters = await calendar.locator('.calendar-day').evaluateAll((elements) =>
    elements.slice(0, 7).map((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.x + bounds.width / 2;
    }),
  );
  expect(firstWeekCenters).toHaveLength(weekdayCenters.length);
  weekdayCenters.forEach((center, index) =>
    expect(Math.abs(center - firstWeekCenters[index]!)).toBeLessThan(0.5),
  );
  await expect(calendar.locator('[data-date="2026-10-25"]')).toHaveClass(/solved/);
  await expect(calendar.locator('[data-date="2026-10-24"]')).toHaveClass(/calendar-day-puzzle/);
  await expect(calendar.locator('[data-date="2026-10-24"]')).not.toHaveClass(/solved/);
  await expect(calendar.locator('[data-date="2026-10-23"]')).toBeVisible();
  await calendar.locator('[data-date="2026-10-24"]').hover();
  await expect(calendar.locator('[data-date="2026-10-24"] [role="tooltip"]')).toHaveText(
    'Historical 2026-10-24',
  );
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/calendar-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await calendar.locator('.calendar-grid').boundingBox())!.width).toBeGreaterThan(240);
  await page.screenshot({ path: `${artifacts}/calendar-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(calendar.getByLabel('Calendar month')).toHaveValue('9');
  await expect(calendar.getByLabel('Calendar year')).toHaveValue('2026');
  await expect(calendar.getByRole('button', { name: 'Previous year' })).toBeDisabled();
  await expect(calendar.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  await expect(calendar.getByRole('button', { name: 'Next year' })).toBeDisabled();
  await expect(calendar.getByLabel('Calendar year').locator('option').first()).toHaveText('2026');
  await expect(calendar.getByLabel('Calendar year').locator('option')).toHaveCount(1);
  await expect(calendar.getByLabel('Calendar month').locator('option[value="8"]')).toBeDisabled();
  await expect(calendar.getByLabel('Calendar month').locator('option[value="9"]')).toBeEnabled();
  await expect(calendar.getByLabel('Calendar month').locator('option[value="10"]')).toBeEnabled();
  await expect(calendar.getByLabel('Calendar month').locator('option[value="11"]')).toBeEnabled();
  const modalBeforeLoading = await calendar.boundingBox();
  const navigationBeforeLoading = await calendar.locator('.calendar-navigation').boundingBox();
  const gridBeforeLoading = await calendar.locator('.calendar-grid').boundingBox();
  let releaseCalendar!: () => void;
  calendarGate = new Promise<void>((resolve) => {
    releaseCalendar = resolve;
  });
  await calendar.getByLabel('Calendar month').selectOption('11');
  await expect(calendar.getByLabel('Calendar month')).toHaveValue('11');
  await expect(calendar.getByRole('status')).toContainText('Loading Dec courses…');
  expect(await calendar.boundingBox()).toEqual(modalBeforeLoading);
  expect(await calendar.locator('.calendar-navigation').boundingBox()).toEqual(
    navigationBeforeLoading,
  );
  expect(await calendar.locator('.calendar-grid').boundingBox()).toEqual(gridBeforeLoading);
  await expect(calendar.locator('.calendar-day')).toHaveCount(42);
  releaseCalendar();
  calendarGate = null;
  await expect(calendar.getByRole('status')).toHaveCount(0);
  await expect(calendar.getByRole('button', { name: 'Next month' })).toBeDisabled();
  await expect(calendar).not.toContainText('No published courses');
  await calendar.getByLabel('Calendar month').selectOption('9');
  await expect(calendar.locator('[data-date="2026-10-24"]')).toBeVisible();
  await calendar.locator('[data-date="2026-10-24"]').click();
  await expect(page).toHaveURL(/date=2026-10-24/);
  await expect(page.locator('.challenge-label')).toContainText('Archive challenge');
  await page.reload();
  await expect(page.locator('.challenge-label')).toContainText('2026-10-24');
  await page.evaluate(() =>
    Object.assign(window, { retainedCanvas: document.querySelector('canvas') }),
  );
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/api/puzzles/by-date/2026-10-24'),
  );
  await page.locator('[data-date="2026-10-24"]').click();
  expect((await refreshed).ok()).toBe(true);
  // The date is already visible while this same-course refresh is still pending.
  // Wait for selection to finish (including its history entry) before going Back.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.challenge-label')).toContainText('2026-10-24');
  expect(
    await page.evaluate(() =>
      Object.is(Reflect.get(window, 'retainedCanvas'), document.querySelector('canvas')),
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page.locator('.challenge-label')).toContainText('2026-10-24');
});
test('leaderboard uses server ranks/ties/population and around-me unsolved state at 320px', async ({
  page,
}) => {
  const p = await fixtures(page);
  let dailyTopLoads = 0;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let releaseScope!: () => void;
  const scopeGate = new Promise<void>((resolve) => {
    releaseScope = resolve;
  });
  let archiveTopLoads = 0;
  await page.route('**/api/puzzles/*/leaderboard?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('scope') === 'daily' && params.get('view') === 'top' && ++dailyTopLoads === 2)
      await refreshGate;
    if (
      params.get('scope') === 'archive' &&
      params.get('view') === 'top' &&
      ++archiveTopLoads === 1
    )
      await scopeGate;
    return route.fulfill({
      json: {
        ...boardFixture(p),
        asOf: '2026-11-17T18:00:00Z',
        view: params.get('view'),
        scope: params.get('scope'),
        page: Number(params.get('page') ?? 1),
        totalPlayers: 45,
        totalPages: 3,
        rows: [
          boardFixture(p).rows[0],
          { ...boardFixture(p).rows[0], player: { id: 'other', nickname: 'Tied guest' } },
        ],
        me: params.get('view') === 'around-me' ? null : boardFixture(p).me,
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  const daily = page.getByRole('radio', { name: 'Original daily', exact: true });
  const allTime = page.getByRole('radio', { name: 'All-time', exact: true });
  await expect(daily).toBeChecked();
  const [dailyBox, allTimeBox] = await Promise.all([daily.boundingBox(), allTime.boundingBox()]);
  expect(dailyBox?.y).toBe(allTimeBox?.y);
  await expect(page.getByRole('dialog')).toContainText('Open — provisional');
  await expect(page.locator('.ranking-number')).toHaveText(['1', '1']);
  await expect(page.getByRole('dialog')).not.toContainText('ranked players');
  await expect(page.getByRole('dialog')).not.toContainText('Puzzle date');
  await expect(page.getByRole('dialog').getByText('Oct 26, 2026')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText('November 17th, 2026');
  await expect(page.getByRole('columnheader')).toHaveText([
    'Rank',
    'Name',
    'Cost',
    'Tiles',
    'Attempts',
    'Time',
    'Path',
    '',
  ]);
  await expect(page.getByText('Cost', { exact: true })).toHaveAttribute(
    'title',
    'Total force cost. Lower values rank better.',
  );
  const sharingHelp = page.getByRole('tooltip');
  await expect(sharingHelp).toBeHidden();
  await page.getByRole('button', { name: 'About leaderboard sharing' }).focus();
  await expect(sharingHelp).toBeVisible();
  await expect(sharingHelp).toHaveText(
    'Leaderboard solutions are shared automatically after daily close. Archive rankings remain open.',
  );
  const dialog = page.getByRole('dialog');
  const heightBeforeRefresh = await dialog.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const refresh = page.getByRole('button', { name: 'Refresh standings', exact: true });
  await refresh.click();
  await expect(dialog.getByRole('status')).toHaveText('Loading standings…');
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().height)).toBe(
    heightBeforeRefresh,
  );
  releaseRefresh();
  await expect(refresh).toBeEnabled();
  const pageInput = page.getByLabel('Leaderboard page', { exact: true });
  await expect(pageInput).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'First page', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await pageInput.fill('2');
  await pageInput.press('Enter');
  await expect(pageInput).toHaveValue('2');
  await page.getByRole('button', { name: 'Last page', exact: true }).click();
  await expect(pageInput).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Last page', exact: true })).toBeDisabled();
  const heightBeforeScopeChange = await dialog.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await allTime.click();
  await expect(allTime).toBeChecked();
  await expect(dialog.getByRole('status')).toHaveText('Loading standings…');
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().height)).toBe(
    heightBeforeScopeChange,
  );
  releaseScope();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('dialog')).not.toContainText('Archive — open');
  await daily.click();
  await expect(daily).toBeChecked();
  await page.getByRole('button', { name: 'Around me', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'You did not play this course on October 26th, 2026.',
  );
  expect(await page.getByRole('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: `${artifacts}/leaderboard-mobile-after.png`, fullPage: true });
});
test('clipboard denial offers selectable spoiler-free practice result and refresh restores draft', async ({
  page,
}) => {
  await fixtures(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Denied')) },
    });
  });
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Play this course unranked', exact: true }).click();
  await page.locator('.tile-option').first().click();
  await page.getByLabel('Selected tile X', { exact: true }).fill('1.125');
  await page.reload();
  // Explicitly select the same local course again; draft namespace is stable across visits.
  await page.getByRole('button', { name: 'Play this course unranked', exact: true }).click();
  await expect(page.locator('.tile-option').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('canvas').click({ position: { x: 1, y: 1 } });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Copy result', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Select and copy the text below');
  await expect(page.getByLabel('Result text')).toHaveValue(/Practice — unranked/);
  const text = await page.getByLabel('Result text').inputValue();
  expect(text).not.toMatch(/fieldId|angle|sequence|rank #/);
});
test('blocked storage falls back promptly and late open cannot overwrite memory mode', async ({
  page,
}) => {
  await fixtures(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: { open: () => ({}) } });
  });
  await page.goto(BASE_URL);
  await expect(
    page.getByText('Progress recovery unavailable after refresh.', { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Play this course unranked', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});
test('saved best sharing refreshes cancellation and suppresses historical rank claims', async ({
  page,
}) => {
  const p = await fixtures(page),
    saved = savedFixture();
  await page.route('**/api/me/progress?*', (route) =>
    route.fulfill({ json: { progress: saved.progress, availability: p.availability } }),
  );
  await page.route('**/api/runs/*', (route) =>
    route.fulfill({
      json: {
        ...saved,
        availability: {
          ...p.availability,
          revision: '1',
          publicationStatus: 'canceled',
          canceledAt: p.serverNow,
          cancellationMessage: 'Published course is broken',
        },
      },
    }),
  );
  await page.goto(BASE_URL);
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await page.getByRole('button', { name: 'Copy result', exact: true }).click();
  await expect(page.getByLabel('Result text')).toHaveValue(/Course canceled/);
  expect(await page.getByLabel('Result text').inputValue()).not.toMatch(/rank #/);
});

test('durable terminal intent is recovered after refresh without a new start or playback', async ({
  page,
}) => {
  const p = await fixtures(page),
    saved = savedFixture();
  let starts = 0;
  await page.route('**/api/runs', (route) => {
    starts++;
    return route.fulfill({ status: 500 });
  });
  await page.route('**/api/runs/by-request/*', (route) => route.fulfill({ json: saved }));
  await page.goto(BASE_URL);
  await expect(
    page.getByRole('button', { name: 'Play this course unranked', exact: true }),
  ).toBeVisible();
  const record = {
    version: 1,
    persistence: 'durable',
    start: startFixture(),
    context: p,
    owner: { tab: 'closed-tab', document: 'closed-document' },
    phase: 'pending',
    cancelRequested: false,
    response: acceptedFixture(),
    intent: saved.completion.intent,
    failures: 0,
    retryAt: 0,
    message: 'Saving unverified result',
  };
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('puttential-progress', 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction('runs', 'readwrite');
        tx.objectStore('runs').put(
          value,
          `${value.start.expectedGuestId}/${value.start.requestId}`,
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, record);
  await page.reload();
  await expect(page.locator('.run-status-list')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Runs', exact: true })).toContainText(
    'Saved and verified.',
  );
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  expect(starts).toBe(0);
});

test('rollover preserves the canvas and draft while an old-scope copy in flight is canceled', async ({
  page,
}) => {
  const p = await fixtures(page),
    saved = savedFixture(),
    nextPuzzle = {
      ...puzzleFixture('2026-10-27'),
      todayDate: '2026-10-27',
      serverNow: '2026-10-27T05:00:00Z',
      nextDailyAt: '2026-10-28T05:00:00Z',
    };
  let nextDay = false,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.addInitScript(() => {
    Object.assign(window, { copiedResults: [] });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copiedResults: string[] }).copiedResults.push(text);
        },
      },
    });
  });
  await page.route('**/api/puzzles/today', (route) =>
    route.fulfill({
      json: nextDay ? nextPuzzle : p,
    }),
  );
  await page.route('**/api/me/progress?*', (route) =>
    route.fulfill({ json: { progress: saved.progress, availability: p.availability } }),
  );
  await page.route('**/api/runs/*', async (route) => {
    await gate;
    await route.fulfill({ json: saved });
  });
  await page.route('**/api/puzzles/*/leaderboard?*', (route) =>
    route.fulfill({ json: boardFixture(p) }),
  );
  await page.goto(BASE_URL);
  await page.locator('.tile-option').first().click();
  await page.getByLabel('Selected tile X', { exact: true }).fill('1.125');
  const stageBeforeRollover = await page.locator('.course-stage').boundingBox();
  await page.evaluate(() =>
    Object.assign(window, { beforeRolloverCanvas: document.querySelector('canvas') }),
  );
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await page.getByRole('button', { name: 'Copy result', exact: true }).click();
  nextDay = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.challenge-label')).toContainText('Archive challenge');
  const dailyNotice = page.locator('.notice-toast');
  await expect(dailyNotice).toContainText(
    'Today’s course is 2026-10-27. Your selected course is preserved.',
  );
  expect(await dailyNotice.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  const stageAfterRollover = await page.locator('.course-stage').boundingBox();
  expect(stageAfterRollover).toEqual(stageBeforeRollover);
  await expect(page.getByLabel('Selected tile X', { exact: true })).toHaveValue('1.125');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { beforeRolloverCanvas: Element }).beforeRolloverCanvas ===
        document.querySelector('canvas'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Dismiss today’s course notice' }).click();
  await expect(dailyNotice).toHaveCount(0);
  release();
  await expect(
    page.getByText('Result unavailable. Retry to refresh its status.', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { copiedResults: string[] }).copiedResults),
  ).toEqual([]);
});

for (const width of [1440, 320]) {
  test(`Runs tab preserves the draft and recovers an accepted run at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const p = await fixtures(page);
    const accepted = acceptedFixture();
    const stopped = savedFixture(accepted, {
      expectedGuestId: playerFixture.id,
      kind: 'aborted',
      observedTick: 0,
    });
    let reads = 0;
    await page.route('**/api/runs/by-request/*', (route) => {
      reads++;
      return route.fulfill({ json: accepted });
    });
    await page.route('**/api/runs/*/complete', (route) => route.fulfill({ json: stopped }));
    await page.goto(BASE_URL);
    await expect(page.locator('.toolkit-note')).toBeVisible();
    await page.evaluate(
      async (record) => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('puttential-progress', 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('runs', 'readwrite');
            tx.objectStore('runs').put(
              record,
              `${record.start.expectedGuestId}/${record.start.requestId}`,
            );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          request.onerror = () => reject(request.error);
        });
      },
      {
        version: 1,
        persistence: 'durable',
        start: startFixture(),
        context: p,
        owner: { tab: 'closed-tab', document: 'closed-document' },
        phase: 'accepted',
        cancelRequested: false,
        response: accepted,
        failures: 0,
        retryAt: 0,
        message: 'Run accepted.',
      },
    );
    await page.reload();
    await expect(page.locator('.pending-run-count')).toHaveText('1');
    await page.locator('.tile-option').first().click();
    await page.getByLabel('Selected tile X', { exact: true }).fill('1.125');
    await page.evaluate(() =>
      Object.assign(window, { tabCanvas: document.querySelector('canvas') }),
    );
    await page.getByRole('tab', { name: 'Toolkit', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    const runs = page.getByRole('tabpanel', { name: 'Runs', exact: true });
    await expect(runs).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Runs', exact: true })).toBeFocused();
    await expect(page.getByRole('tabpanel', { name: 'Toolkit', exact: true })).toBeHidden();
    await expect(runs).toContainText('Accepted run needs recovery');
    await expect(runs.getByRole('button', { name: 'Recover interrupted run' })).toBeVisible();
    await runs.getByRole('button', { name: 'Retry run status' }).click();
    await expect.poll(() => reads).toBeGreaterThan(1);
    await runs.getByRole('button', { name: 'Cancel run', exact: true }).click();
    await expect(runs).toContainText('Stopped run saved.');
    await expect(page.locator('.pending-run-count')).toHaveCount(0);
    await expect(page.locator('.run-status-list')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await mkdir('artifacts/runs-tab', { recursive: true });
    await page.screenshot({ path: `artifacts/runs-tab/runs-${width}-after.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Runs', exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(page.getByLabel('Selected tile X', { exact: true })).toHaveValue('1.125');
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { tabCanvas: Element }).tabCanvas ===
          document.querySelector('canvas'),
      ),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
}
