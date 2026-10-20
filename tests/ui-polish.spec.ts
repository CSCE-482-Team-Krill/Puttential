import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { documentFromLevel, levelBounds, quantizePosition, type Level } from '../src/game';
import { dailyFixture, inventoryLevel, successLevel } from './ui-polish-fixtures';

const URL = 'http://127.0.0.1:3000/';
const artifacts = 'artifacts/ui-polish';
test.use({
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  locale: 'en-US',
  timezoneId: 'America/Chicago',
});

test.beforeEach(async ({ context }) => {
  await mkdir(artifacts, { recursive: true });
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
        muteMusic: false,
        muteEffects: false,
        reducedMotion: true,
        showPreview: true,
      }),
    );
  });
});

async function openLevel(page: Page, level: Level) {
  await page.route('**/api/puzzles/today', (route) => route.fulfill({ json: dailyFixture(level) }));
  await page.goto(URL);
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

// Sample the actual white top outline of the isolated field, excluding its arrows.
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
        if (data[i]! > 240 && data[i + 1]! > 240 && data[i + 2]! > 240 && data[i + 3]! > 220)
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
  '.local-level-import input',
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
    await expect(page.getByRole('status')).toHaveText("Loading today's course…");
    await expect(page.locator('.brand')).toContainText('Puttential');
    await expect(page.locator('.loading-shell button')).toHaveCount(0);
    await noOverflow(page);
    release();
    await expect(page.locator('.course-canvas.editable')).toHaveCount(1);
    await page.unroute('**/api/puzzles/today');
    await page.route('**/api/puzzles/today', (route) =>
      route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
    );
    await page.reload();
    await expect(page.locator('.api-notice')).toContainText(
      "Today's puzzle is unavailable. Practice courses still work; those runs aren't saved.",
    );
    await expect(page.locator('.challenge-label')).toContainText('Practice challenge');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });
}

test('desktop joined regions do not stretch with empty, three, twelve or long inventories', async ({
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
    const chain = [
      'course-meta',
      'course-stage',
      'course-identity',
      'primary-controls',
      'secondary-course-actions',
    ];
    const gaps = chain.slice(1).map((key, i) => r[key]!.y - r[chain[i]!]!.bottom);
    gaps.forEach((gap) => {
      expect(gap).toBeGreaterThanOrEqual(-1);
      expect(gap).toBeLessThanOrEqual(4);
    });
    expect(r['control-column']!.x).toBeGreaterThan(r['course-stage']!.right);
    expect(r['control-column']!.width).toBe(300);
    expect(r['course-stage']!.y).toBeLessThan(r['course-identity']!.y);
    expect(
      await page.locator('.control-column').evaluate((e) => getComputedStyle(e).overflowY),
    ).toBe('visible');
    if (count) {
      await page.locator('.tile-option').last().scrollIntoViewIfNeeded();
      await expect(page.locator('.tile-option').last()).toBeInViewport();
    } else
      await expect(page.locator('.empty-inventory')).toHaveText(
        'No force blocks available for this course.',
      );
    await noOverflow(page);
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
  const metrics = page.locator('.run-metrics');
  await expect(metrics.locator('dd').nth(0)).toHaveText('1pt');
  await expect(metrics.locator('dd').nth(1)).toHaveText('1/ 2');
  const cards = page.locator('.tile-option');
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.last()).toHaveAttribute('aria-pressed', 'false');
  await cards.last().click();
  await expect(metrics.locator('dd').nth(0)).toHaveText('2pt');
  await expect(metrics.locator('dd').nth(1)).toHaveText('2/ 2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(cards.first()).toBeDisabled();
  await expect(cards.first()).toContainText('ON');
  expect(await cards.first().evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
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
    const chain = [
      'course-meta',
      'course-identity',
      'course-stage',
      'primary-controls',
      'control-column',
      'secondary-course-actions',
    ];
    for (let i = 1; i < chain.length; i++)
      expect(r[chain[i]!]!.y).toBeGreaterThanOrEqual(r[chain[i - 1]!]!.bottom);
    expect(r['control-column']!.y - r['primary-controls']!.bottom).toBeLessThanOrEqual(16);
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
    await expect(page.locator('.run-metrics dd').last()).toHaveText('1');
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
