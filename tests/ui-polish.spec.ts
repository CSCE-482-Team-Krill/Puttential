import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { documentFromLevel, levelBounds, quantizePosition, type Level } from '../src/game';
import { dailyFixture, inventoryLevel, successLevel } from './ui-polish-fixtures';

const URL = 'http://127.0.0.1:3000/';
const artifacts =
  process.env.PUTTENTIAL_REVIEW_ARTIFACTS ?? 'artifacts/iteration-two/ui-regression';
test.use({
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  locale: 'en-US',
  timezoneId: 'America/Chicago',
});

test.beforeEach(async ({ context }) => {
  await mkdir(artifacts, { recursive: true });
  await context.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } }),
  );
  // Keep every fixture run off the real database, including tests concerned only
  // with appearance/motion. Individual save tests override these at page scope.
  await context.route('**/api/attempts', (route) =>
    route.fulfill({ status: 201, json: { attemptId: 'ui-polish-attempt' } }),
  );
  await context.route('**/api/solutions', (route) =>
    route.fulfill({ status: 201, json: { solutionId: 'ui-polish-solution' } }),
  );
  await context.addInitScript(() => {
    if (localStorage.getItem('puttential-preferences')) return;
    localStorage.setItem(
      'puttential-preferences',
      JSON.stringify({
        reducedMotion: true,
        showPreview: true,
      }),
    );
  });
});

async function openLevel(page: Page, level: Level) {
  await page.route('**/api/puzzles/today', (route) => route.fulfill({ json: dailyFixture(level) }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Play this course unranked', exact: true }).click();
  await expect(page.locator('.course-canvas')).toHaveClass(/editable/);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${artifacts}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { visibility: hidden; }',
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function regions(page: Page) {
  return page.locator('.game-layout > *').evaluateAll((elements) =>
    Object.fromEntries(
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return [
          element.classList[0],
          { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        ];
      }),
    ),
  );
}

// The real renderer's projection, calculated from fixture data and measured CSS pixels.
async function projection(page: Page, level: Level, position: { x: number; y: number }) {
  const canvas = page.locator('.course-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const bounds = levelBounds(level);
  const scale = Math.min(
    box.width / (bounds.maxX - bounds.minX + 0.3),
    box.height / (bounds.maxY - bounds.minY + 0.3),
  );
  const x = box.width / 2 + (position.x - (bounds.minX + bounds.maxX) / 2) * scale;
  const y = box.height / 2 - (position.y - (bounds.minY + bounds.maxY) / 2) * scale;
  return { x, y, clientX: box.x + x, clientY: box.y + y, scale, box };
}

// Sample the white or selected gold top outline, excluding its arrows.
// The 2px outline is allowed a 2px raster tolerance, at deviceScaleFactor 1.
async function fieldEdge(page: Page, level: Level, position: { x: number; y: number }) {
  const p = await projection(page, level, position);
  return page.locator('canvas').evaluate((element, { x, y, scale }) => {
    const context = element.getContext('2d')!;
    const width = Math.max(3, Math.floor(scale * 0.4));
    const data = context.getImageData(
      Math.round(x - width / 2),
      Math.round(y - scale * 0.6) - 2,
      width,
      5,
    ).data;
    let best = 0;
    for (let row = 0; row < 5; row++) {
      let white = 0;
      for (let column = 0; column < width; column++) {
        const i = (row * width + column) * 4;
        if (data[i]! > 240 && data[i + 1]! >= 200 && data[i + 2]! >= 95 && data[i + 3]! > 220)
          white++;
      }
      best = Math.max(best, white / width);
    }
    return best;
  }, p);
}

async function expectField(page: Page, level: Level, position: { x: number; y: number }) {
  await expect.poll(() => fieldEdge(page, level, position)).toBeGreaterThan(0.75);
}

async function dragField(
  page: Page,
  level: Level,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const p = await projection(page, level, from);
  await page.mouse.move(p.clientX, p.clientY);
  await page.mouse.down();
  await page.mouse.move(
    p.clientX + (to.x - from.x) * p.scale,
    p.clientY - (to.y - from.y) * p.scale,
    { steps: 8 },
  );
  await page.mouse.up();
  await expectField(page, level, to);
}

const stableSelectors = [
  '.course-canvas',
  '.run-controls',
  '.play-button',
  '.tile-list',
  '.tile-option',
];
async function rememberNodes(page: Page) {
  await page.evaluate((selectors) => {
    Object.assign(window, { polishNodes: selectors.map((s) => document.querySelector(s)) });
  }, stableSelectors);
}
async function sameNodes(page: Page) {
  expect(
    await page.evaluate((selectors) => {
      const nodes = (window as unknown as { polishNodes: Element[] }).polishNodes;
      return selectors.every(
        (s, i) =>
          document.querySelectorAll(s).length === 1 &&
          document.querySelector(s) === nodes[i] &&
          nodes[i]?.isConnected,
      );
    }, stableSelectors),
  ).toBe(true);
  await expect(page.locator('.loading-shell')).toHaveCount(0);
}

for (const [width, height] of [
  [320, 720],
  [390, 844],
  [1440, 900],
]) {
  test(`honest loading shell at ${width} transitions to daily and fallback`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/puzzles/today', async (route) => {
      await gate;
      await route.fulfill({ json: dailyFixture(inventoryLevel(1)) });
    });
    await page.goto(URL);
    await expect(page.getByRole('status')).toContainText("Loading today's course…");
    await expect(page.getByRole('img', { name: 'Puttential', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Play legacy course', exact: true }),
    ).toBeEnabled();
    await noOverflow(page);
    release();
    await expect(page.locator('.course-canvas.editable')).toHaveCount(1);
    await page.unroute('**/api/puzzles/today');
    await page.route('**/api/puzzles/today', (route) =>
      route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
    );
    await page.reload();
    await expect(page.locator('.api-notice')).toContainText('Legacy courses are still available');
    await page.getByRole('button', { name: 'Play legacy course', exact: true }).click();
    await expect(page.locator('.challenge-label')).toHaveText('Legacy course');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });
}

test('desktop regions fit the viewport with empty, three, twelve or long inventories', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const recorded = [];
  for (const [count, long] of [
    [0, false],
    [3, false],
    [12, false],
    [12, true],
  ] as const) {
    await page.unroute('**/api/puzzles/today');
    await openLevel(page, inventoryLevel(count, { long }));
    const r = await regions(page);
    const chain = ['course-meta', 'course-stage'];
    const gaps = chain.slice(1).map((key, i) => r[key]!.y - r[chain[i]!]!.bottom);
    gaps.forEach((gap, index) => {
      expect(gap).toBeGreaterThanOrEqual(-1);
      expect(gap).toBeLessThanOrEqual(index === 1 ? 12 : 4);
    });
    expect(r['control-column']!.x).toBeGreaterThan(r['course-stage']!.right);
    expect(r['course-stage']!.width / r['control-column']!.width).toBeGreaterThan(3.5);
    expect(r['course-stage']!.height).toBeGreaterThan(900 * 0.65);
    expect(r['control-column']!.bottom).toBeCloseTo(r['course-stage']!.bottom, 0);
    await expect(page.locator('.course-heading h1')).toBeVisible();
    await expect(page.locator('.secondary-course-actions, .run-metrics')).toHaveCount(0);
    await expect(page.locator('.control-column .run-controls button')).toHaveCount(2);
    expect(
      await page.locator('.control-column').evaluate((e) => getComputedStyle(e).overflowY),
    ).toBe('hidden');
    if (count) {
      await page.locator('.tile-option').last().scrollIntoViewIfNeeded();
      await expect(page.locator('.tile-option').last()).toBeInViewport();
    } else
      await expect(page.locator('.empty-inventory')).toHaveText(
        'No force blocks available for this course.',
      );
    await noOverflow(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
    recorded.push({ count, long, gaps, regions: r });
    await screenshot(page, `inventory-${count}${long ? '-long' : ''}`);
  }
  for (const item of recorded) expect(item.gaps).toEqual(recorded[0]!.gaps);
  await writeFile(
    `${artifacts}/desktop-track-measurements.json`,
    JSON.stringify(recorded, null, 2),
  );
});

test('real inventory, initial ON state, live counts and disabled cards agree', async ({ page }) => {
  await openLevel(page, inventoryLevel(2, { enabled: true }));
  await expect(page.locator('.inventory-count')).toHaveText('2');
  await expect(page.locator('.tile-option.selected')).toHaveCount(1);
  const cards = page.locator('.tile-option');
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.last()).toHaveAttribute('aria-pressed', 'false');
  await cards.last().click();
  await expect(page.locator('.tile-option.selected')).toHaveCount(2);
  await expect(cards.first().locator('.tile-cost')).toHaveText('1 pt');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(cards.first()).toBeDisabled();
  await expect(cards.first()).toContainText('ON');
  expect(await cards.first().evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
});

test('landscape game fits one viewport and keeps controls reachable after height changes', async ({
  page,
}) => {
  await openLevel(page, inventoryLevel(3));
  await page.locator('.tile-option').first().click();
  for (const [width, height] of [
    [960, 600],
    [1024, 600],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1440, 1024],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect(page.locator('.course-canvas.editable')).toHaveCount(1);
    const geometry = await page.evaluate(() => {
      const selectors = [
        '.site-header',
        '.course-canvas',
        '.course-identity',
        '.run-controls',
        '.course-stage',
        '.control-column',
      ];
      return {
        document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        viewport: [innerWidth, innerHeight],
        regions: selectors.map((selector) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return { selector, x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height };
        }),
      };
    });
    expect(geometry.document).toEqual(geometry.viewport);
    for (const region of geometry.regions) {
      expect(region.x, region.selector).toBeGreaterThanOrEqual(0);
      expect(region.y, region.selector).toBeGreaterThanOrEqual(0);
      expect(region.right, region.selector).toBeLessThanOrEqual(width!);
      expect(region.bottom, region.selector).toBeLessThanOrEqual(height!);
      expect(region.height, region.selector).toBeGreaterThan(0);
    }
    // Supporting UI must leave most of the screen for a readable course.
    const canvas = geometry.regions.find((region) => region.selector === '.course-canvas')!;
    expect(canvas.height).toBeGreaterThan(height! * 0.7);
    expect(height! - canvas.bottom).toBeLessThanOrEqual(26);
    await expect(page.getByRole('button', { name: 'Reset layout', exact: true })).toBeInViewport({
      ratio: 1,
    });
    for (const card of await page.locator('.tile-option').all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeInViewport({ ratio: 1 });
    }
    await expect(page.locator('.tile-option').first()).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(30, 30);
    await page.mouse.wheel(0, 1200);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
  // The real API can be unavailable; its notice also needs room in the viewport.
  await page.route('**/api/puzzles/today', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  );
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.reload();
  await expect(page.locator('.api-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Play legacy course', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(600);
});

for (const [width, height] of [
  [320, 720],
  [390, 844],
  [390, 667],
]) {
  test(`mobile reading order, compact toolkit and ON → drag → Play at ${width}×${height}`, async ({
    page,
  }) => {
    const level = inventoryLevel(1);
    await page.setViewportSize({ width: width!, height: height! });
    await openLevel(page, level);
    const r = await regions(page);
    const chain = ['course-meta', 'course-stage', 'control-column'];
    for (let i = 1; i < chain.length; i++)
      expect(r[chain[i]!]!.y).toBeGreaterThanOrEqual(r[chain[i - 1]!]!.bottom);
    expect(r['control-column']!.y - r['course-stage']!.bottom).toBeLessThanOrEqual(16);
    const gap = await page.evaluate(
      () =>
        document.querySelector('.tile-option')!.getBoundingClientRect().top -
        document.querySelector('.control-heading')!.getBoundingClientRect().bottom,
    );
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(16);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.course-canvas')).toHaveCount(1);
    await expect(page.locator('.play-button')).toHaveCount(1);
    await expect(page.locator('.main-nav button')).toHaveCount(5);
    await screenshot(page, `after-mobile-${width}x${height}`);
    await page.locator('.tile-option').click();
    await expectField(page, level, { x: -3, y: 0 });
    await dragField(page, level, { x: -3, y: 0 }, { x: -2, y: -0.5 });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.course-status')).toHaveText(/In motion|Finished/);
    await noOverflow(page);
  });
}

test('all responsive widths retain course framing, direct nav targets and no page overflow', async ({
  page,
}) => {
  await openLevel(page, inventoryLevel(1));
  for (const width of [320, 390, 700, 760, 850, 959, 960, 961, 1050, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
    await noOverflow(page);
    for (const button of await page.locator('.main-nav button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    const p = await projection(page, inventoryLevel(1), { x: 0, y: 0 });
    const bounds = levelBounds(inventoryLevel(1));
    expect((bounds.maxX - bounds.minX) * p.scale).toBeLessThan(p.box.width);
    expect((bounds.maxY - bounds.minY) * p.scale).toBeLessThan(p.box.height);
    if ([1440, 1920, 959, 960].includes(width)) {
      await page.evaluate(() => scrollTo(0, 0));
      await screenshot(
        page,
        width < 1000
          ? `near-breakpoint-${width}`
          : `after-desktop-${width}x${width === 1920 ? 1080 : 900}`,
      );
    }
  }
});

for (const width of [390, 959, 960, 1050, 1440]) {
  test(`canvas movement has correct rendered displacement and clamps at bounds at ${width}`, async ({
    page,
  }) => {
    const level = inventoryLevel(1, { enabled: true });
    await page.setViewportSize({ width, height: 900 });
    await openLevel(page, level);
    await expectField(page, level, { x: -3, y: 0 });
    await page.locator('canvas').screenshot({ path: `${artifacts}/pointer-${width}-before.png` });
    await dragField(page, level, { x: -3, y: 0 }, { x: -2, y: -0.5 });
    expect(await fieldEdge(page, level, { x: -3, y: 0 })).toBeLessThan(0.2);
    await page.locator('canvas').screenshot({ path: `${artifacts}/pointer-${width}-after.png` });
    const p = await projection(page, level, { x: -2, y: -0.5 });
    await page.mouse.move(p.clientX, p.clientY);
    await page.mouse.down();
    await page.mouse.move(p.clientX, p.box.y + p.box.height + 200, { steps: 8 });
    await page.mouse.up();
    await expectField(page, level, { x: -2, y: levelBounds(level).minY + 0.6 });
  });
}

test('completed moves, fresh hit targets, mounted nodes and keyboard focus survive 959↔960', async ({
  page,
}) => {
  const level = inventoryLevel(1, { enabled: true });
  await page.setViewportSize({ width: 959, height: 1000 });
  await openLevel(page, level);
  await dragField(page, level, { x: -3, y: 0 }, { x: -2, y: -0.5 });
  await rememberNodes(page);
  await page.locator('.tile-option').focus();
  for (const width of [960, 959]) {
    await page.setViewportSize({ width, height: 1000 });
    await sameNodes(page);
    await expect(page.locator('.tile-option')).toBeFocused();
    await expectField(page, level, { x: -2, y: -0.5 });
    await expect(page.locator('.course-status')).toHaveText('Planning');
  }
  await dragField(page, level, { x: -2, y: -0.5 }, { x: -1, y: -1 });
  await page.setViewportSize({ width: 960, height: 1000 });
  await sameNodes(page);
  await expectField(page, level, { x: -1, y: -1 });
});

for (const [from, to] of [
  [959, 960],
  [960, 959],
]) {
  test(`active pointer resize ${from}→${to} safely cancels without a jump`, async ({
    page,
  }, testInfo) => {
    const level = inventoryLevel(1, { enabled: true });
    await page.setViewportSize({ width: from!, height: 1000 });
    await openLevel(page, level);
    const p = await projection(page, level, { x: -3, y: 0 });
    await page.mouse.move(p.clientX, p.clientY);
    await page.mouse.down();
    await page.mouse.move(p.clientX + p.scale * 0.5, p.clientY, { steps: 5 });
    await expectField(page, level, { x: -2.5, y: 0 });
    const held = { x: p.clientX + p.scale * 0.5, y: p.clientY };
    await page.setViewportSize({ width: to!, height: 1000 });
    // Continue moving in screen coordinates, as a real held pointer does.
    // The old projection must not move the field after the layout changes.
    await page.mouse.move(held.x + 1, held.y);
    await expectField(page, level, { x: -2.5, y: 0 });
    await page.mouse.up();
    await expectField(page, level, { x: -2.5, y: 0 });
    await page.locator('canvas').screenshot({ path: `${artifacts}/active-drag-${from}-fixed.png` });
    await dragField(page, level, { x: -2.5, y: 0 }, { x: -2, y: -0.5 });
    testInfo.annotations.push({
      type: 'active-gesture',
      description:
        'Approved safe cancellation: a held pointer moved after resize does not jump; committed movement survives and a fresh drag aligns.',
    });
  });
}

test('unranked execution keeps mounted nodes across responsive changes and makes no competitive writes', async ({
  page,
}) => {
  const level = { ...successLevel, goal: { ...successLevel.goal, holdSeconds: 0.6 } };
  let posts = 0;
  await page.route('**/api/runs**', (route) => {
    posts++;
    return route.fulfill({ status: 503 });
  });
  await openLevel(page, level);
  await page.evaluate(() =>
    Object.assign(window, {
      runNodes: ['canvas', '.play-button', '.run-controls', '.tile-list'].map((s) =>
        document.querySelector(s),
      ),
    }),
  );
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.setViewportSize({ width: 960, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Nice work!' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Practice — unranked');
  await page.setViewportSize({ width: 959, height: 900 });
  expect(
    await page.evaluate(() => {
      const stored = (window as unknown as { runNodes: Element[] }).runNodes;
      return ['canvas', '.play-button', '.run-controls', '.tile-list'].every(
        (s, i) => stored[i] === document.querySelector(s),
      );
    }),
  ).toBe(true);
  await screenshot(page, 'result-success');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.locator('canvas')).not.toHaveClass(/editable/);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('canvas')).toHaveClass(/editable/);
  expect(posts).toBe(0);
});

test('practice failure stays unranked and explains close versus retry', async ({ page }) => {
  let attempts = 0,
    solutions = 0;
  await page.route('**/api/attempts', (route) => {
    attempts++;
    return route.fulfill({ status: 500, json: { error: 'Offline' } });
  });
  await page.route('**/api/solutions', (route) => {
    solutions++;
    return route.fulfill({ status: 500 });
  });
  await openLevel(page, inventoryLevel(1));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'So close' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'Close this panel, then choose Try again to adjust your fields.',
  );
  await expect(dialog).toContainText('Practice — unranked');
  await screenshot(page, 'result-failure');
  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.locator('.tile-option')).toBeDisabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.tile-option')).toBeEnabled();
  expect(attempts).toBe(0);
  expect(solutions).toBe(0);
});

test('production data stays unavailable; development preview has six labeled examples', async ({
  page,
}) => {
  await openLevel(page, inventoryLevel(1));
  for (const [name, file] of [
    ['Help', 'help'],
    ['Profile', 'profile'],
    ['Leaderboard', 'leaderboard-unavailable-production'],
    ['Calendar', 'calendar'],
    ['Settings', 'settings'],
  ]) {
    const trigger = page.getByRole('button', { name: name!, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: name! });
    await expect(dialog).toBeVisible();
    if (name === 'Help')
      await expect(dialog.locator('summary')).toHaveText([
        'Objective',
        'How to play',
        'Scoring',
        'Daily Challenges',
        'Saving and recovery',
      ]);
    if (name === 'Profile')
      await expect(dialog).toContainText('Competitive guest session unavailable');
    if (name === 'Leaderboard') {
      await expect(dialog).toContainText('Choose a published dated course');
      await expect(dialog.locator('.ranking-row')).toHaveCount(0);
    }
    if (name === 'Calendar') {
      await expect(dialog.locator('.legacy-course')).toHaveCount(2);
      await expect(
        dialog.getByRole('heading', { name: 'Legacy courses', exact: true }),
      ).toBeVisible();
      await expect(dialog).toContainText('Archive unavailable');
    }
    await screenshot(page, `modals-${file}`);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  const response = await page.goto(`${URL}modal-preview`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByText('Preview only — example courses and dates.', { exact: true }),
  ).toBeVisible();
  await screenshot(page, 'preview-fixture-label');
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('EXAMPLE RANKINGS — PREVIEW ONLY');
  await expect(page.locator('.ranking-row')).toHaveCount(6);
  await expect(page.locator('.your-row')).toHaveCount(0);
  await screenshot(page, 'modals-leaderboard-six-example-rows-preview');
});

test('short dialogs scroll, trap Tab both ways, close on backdrop and retain preferences', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openLevel(page, inventoryLevel(1));
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  for (const summary of await page.locator('summary').all()) await summary.click();
  expect(await page.locator('.modal-body').evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const close = page.getByRole('button', { name: 'Close panel' });
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Open local course', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.getByRole('switch', { name: 'Show path preview' }).click();
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Show path preview' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('dialog').getByRole('switch')).toHaveCount(2);
});

test('integrated import rejects corrupt/oversize data, retains pending file input across resize and respects camera bounds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 959, height: 900 });
  await openLevel(page, inventoryLevel(1));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const input = page.locator('.modal input[type=file]');
  await expect(input).toHaveCount(1);
  for (const [name, content, error] of [
    ['invalid.json', '{broken', /JSON|property name/i],
    ['oversize.json', ' '.repeat(2_000_001), /too large/],
  ] as const) {
    await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(page.locator('.local-level-import [role=alert]')).toContainText(error);
  }
  const doc = documentFromLevel({ ...inventoryLevel(1), id: 'imported-polish-course' });
  doc.editor.arena.bounds = { minX: -12, maxX: 12, minY: -8, maxY: 8 };
  await page.evaluate(() => {
    const original = File.prototype.text;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.assign(window, { releaseImport: release, importReads: 0 });
    File.prototype.text = async function () {
      const state = window as unknown as { importReads: number };
      state.importReads++;
      await gate;
      return original.call(this);
    };
  });
  await rememberNodes(page);
  await input.setInputFiles({
    name: 'course.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await page.setViewportSize({ width: 960, height: 900 });
  await sameNodes(page);
  await page.setViewportSize({ width: 959, height: 900 });
  await sameNodes(page);
  await page.evaluate(() => (window as unknown as { releaseImport: () => void }).releaseImport());
  await expect(page.locator('h1')).toHaveText('Imported Polish Course');
  await expect(page.locator('.challenge-label')).toHaveText('Local course — unranked');
  await expect(page.locator('.local-level-import [role=alert]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { importReads: number }).importReads),
  ).toBe(1);
  await sameNodes(page);
  await page.locator('.tile-option').click();
  await page.mouse.move(0, 0);
  // Imported bounds must frame the field using the editor camera, not levelBounds.
  await expect
    .poll(async () =>
      page.locator('canvas').evaluate((e) => {
        const ctx = e.getContext('2d')!,
          scale = Math.min(e.clientWidth / 24.3, e.clientHeight / 16.3);
        const x = Math.round(e.clientWidth / 2 - 3 * scale),
          y = Math.round(e.clientHeight / 2 - 0.6 * scale);
        const data = ctx.getImageData(x, y - 2, 1, 5).data;
        return Array.from(
          { length: 5 },
          (_, i) => data[i * 4 + 3]! > 220 && data[i * 4]! > 240,
        ).some(Boolean);
      }),
    )
    .toBe(true);
  let posts = 0;
  await page.route('**/api/attempts', (route) => {
    posts++;
    return route.fulfill({ status: 500 });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'So close' })).toBeVisible();
  expect(posts).toBe(0);
});

test('zoom-equivalent reflow, enlarged text and task-oriented tab order', async ({ page }) => {
  await openLevel(page, inventoryLevel(1, { long: true }));
  // 1280 at 200% and 400% = effective layout widths 640 and 320 CSS px.
  // This measures reflow, not native browser chrome zoom.
  for (const width of [640, 320, 256]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.addStyleTag({ content: 'html { font-size: 20px; }' });
    await noOverflow(page);
    await expect(page.locator('.tile-info strong')).toContainText('carefully positioned');
  }
  await page.locator('.tile-option').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.play-button')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reset layout', exact: true })).toBeFocused();
});

test('rendered text and essential control colors retain contrast in each UI state', async ({
  page,
}) => {
  await openLevel(page, inventoryLevel(1));
  const rows: {
    label: string;
    foreground: number[];
    background: number[];
    ratio: number;
    minimum: number;
  }[] = [];
  function luminance(rgb: number[]) {
    const [r, g, b] = rgb.map((value) => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
  }
  async function measure(label: string, selector: string, property = 'color', minimum = 4.5) {
    const colors = await page
      .locator(selector)
      .first()
      .evaluate((element, property) => {
        const rgba = (value: string) => {
          const parts = value.match(/[\d.]+/g)!.map(Number);
          return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
        };
        const ancestors: Element[] = [];
        for (let parent: Element | null = element; parent; parent = parent.parentElement)
          ancestors.unshift(parent);
        let background = [255, 255, 255];
        for (const ancestor of ancestors) {
          if (ancestor === element && property === 'background-color') continue;
          const color = rgba(getComputedStyle(ancestor).backgroundColor),
            alpha = color[3]!;
          background = background.map((channel, i) => color[i]! * alpha + channel * (1 - alpha));
        }
        const color = rgba(getComputedStyle(element).getPropertyValue(property)),
          alpha = color[3]!;
        const foreground = background.map(
          (channel, i) => color[i]! * alpha + channel * (1 - alpha),
        );
        return { foreground, background };
      }, property);
    const a = luminance(colors.foreground),
      b = luminance(colors.background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    rows.push({ label, ...colors, ratio, minimum });
    expect(ratio, label).toBeGreaterThanOrEqual(minimum);
  }
  await measure('Body instruction', '.control-heading p');
  await measure('Course label', '.challenge-label');
  await measure('Toolkit note', '.toolkit-note');
  await measure('Nav default', '.nav-button');
  await measure('Play default', '.play-button');
  await page.locator('.play-button').hover();
  await measure('Play hover', '.play-button');
  await measure('OFF field name', '.tile-info strong');
  await measure('OFF field state', '.tile-info small');
  await page.locator('.tile-option').hover();
  await measure('OFF hover state', '.tile-info small');
  await page.locator('.tile-option').click();
  await page.mouse.move(0, 0);
  await measure('ON field state', '.tile-info small');
  await measure('Selected border', '.tile-option', 'border-top-color', 3);
  await page.locator('.tile-option').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await measure('Focus indicator', '.tile-option', 'outline-color', 3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await measure('Disabled ON field name', '.tile-info strong');
  await measure('Disabled ON field state', '.tile-info small');
  expect(await page.locator('.tile-option').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Open local course', exact: true }).focus();
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await measure('Import warning', '.local-level-import [role=alert]');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await measure('Modal heading', '.modal-header h2');
  await measure('Modal unavailable text', '.modal-body p');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await measure('OFF switch thumb', '.switch span', 'background-color', 3);
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await measure('ON switch thumb', '.switch.on span', 'background-color', 3);
  const table = [
    '# Rendered UI contrast audit',
    '',
    'Chromium, Windows, device scale 1. Colors measured from computed styles with ancestor alpha compositing. Ratios use WCAG relative luminance. Canvas paints are not included in this DOM text audit.',
    '',
    '| State | Foreground RGB | Background RGB | Ratio | Minimum |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.label} | ${row.foreground.join(', ')} | ${row.background.join(', ')} | ${row.ratio.toFixed(2)}:1 | ${row.minimum}:1 |`,
    ),
    '',
    'The reference palette uses darker muted and coral companions for readable text. Existing canvas field-placement keyboard limitations prevent a whole-game accessibility certification.',
  ];
  await writeFile(`${artifacts}/contrast-audit.md`, table.join('\n') + '\n');
});

test('OS and saved reduced motion suppress UI transitions while gameplay still runs', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openLevel(page, inventoryLevel(1));
  expect(
    await page.locator('.play-button').evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await page.keyboard.press('Escape');
  expect(
    await page.locator('.play-button').evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toContain('0.14s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.play-button').evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'So close' })).toBeVisible();
});
