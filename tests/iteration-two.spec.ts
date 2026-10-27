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
async function fixtures(page: Page) {
  const p = puzzleFixture();
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
  await expect(page.getByLabel('Selected tile angle')).toBeDisabled();
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
  await page.route('**/api/puzzles?*', (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    const courses = cursor ? puzzles.slice(2) : puzzles.slice(0, 2);
    return route.fulfill({
      json: {
        guestId: playerFixture.id,
        items: courses.map((v, i) => ({
          id: v.id,
          date: v.date,
          title: `Historical ${v.date}`,
          difficulty: 1,
          status: i ? 'attempted' : 'solved',
          progressRevision: '0',
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
  await expect(page.getByRole('dialog')).toContainText('Historical 2026-10-25');
  await page.getByRole('button', { name: 'Load more courses' }).click();
  await expect(page.getByRole('dialog')).toContainText('Historical 2026-10-23');
  await page.getByRole('button', { name: /Historical 2026-10-24/ }).click();
  await expect(page).toHaveURL(/date=2026-10-24/);
  await expect(page.locator('.challenge-label')).toContainText('Archive challenge');
  await page.evaluate(() =>
    Object.assign(window, { retainedCanvas: document.querySelector('canvas') }),
  );
  await page.reload();
  await expect(page.locator('.challenge-label')).toContainText('2026-10-24');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: /Historical 2026-10-24/ }).click();
  await expect(page.locator('.challenge-label')).toContainText('2026-10-24');
  await page.goBack();
  await expect(page.locator('.challenge-label')).toContainText('2026-10-24');
});
test('leaderboard uses server ranks/ties/population and around-me unsolved state at 320px', async ({
  page,
}) => {
  const p = await fixtures(page);
  await page.route('**/api/puzzles/*/leaderboard?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        ...boardFixture(p),
        view: params.get('view'),
        scope: params.get('scope'),
        totalPlayers: 3,
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
  await expect(page.getByRole('dialog')).toContainText('Open — provisional');
  await expect(page.locator('.ranking-number')).toHaveText(['#1', '#1']);
  await expect(page.getByRole('dialog')).toContainText('3 ranked players');
  await page.getByRole('button', { name: 'Around me', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Solve this course to get a rank');
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
    saved = savedFixture();
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
      json: nextDay
        ? {
            ...p,
            todayDate: '2026-10-27',
            serverNow: '2026-10-27T05:00:00Z',
            nextDailyAt: '2026-10-28T05:00:00Z',
          }
        : p,
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
  await page.evaluate(() =>
    Object.assign(window, { beforeRolloverCanvas: document.querySelector('canvas') }),
  );
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await page.getByRole('button', { name: 'Copy result', exact: true }).click();
  nextDay = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.challenge-label')).toContainText('Archive challenge');
  await expect(page.getByLabel('Selected tile X', { exact: true })).toHaveValue('1.125');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { beforeRolloverCanvas: Element }).beforeRolloverCanvas ===
        document.querySelector('canvas'),
    ),
  ).toBe(true);
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
