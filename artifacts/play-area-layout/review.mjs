import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { dailyFixture, inventoryLevel } from '../../tests/ui-polish-fixtures.ts';

const phase = process.argv[2] ?? 'after';
const directory = new URL('./', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/puzzles/today', (route) =>
  route.fulfill({ json: dailyFixture(inventoryLevel(3)) }),
);
try {
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Puttential home' }).waitFor();
  await page.locator('.course-canvas.editable').waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Exclude Next's development toolbar from the design review screenshots.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const measurements = [];
  for (const width of [1440, 390, 320, 768, 960, 1366]) {
    await page.setViewportSize({ width, height: width >= 960 ? 900 : 844 });
    await page.locator('.brand-logo').evaluate((image) => image.decode());
    const layout = await page.evaluate(() => {
      const brand = document.querySelector('.brand').getBoundingClientRect();
      const nav = document.querySelector('.main-nav').getBoundingClientRect();
      return {
        viewport: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        overlaps:
          brand.left < nav.right &&
          brand.right > nav.left &&
          brand.top < nav.bottom &&
          brand.bottom > nav.top,
        logo: document.querySelector('.brand-logo').getBoundingClientRect().toJSON(),
        course: document.querySelector('.course-canvas').getBoundingClientRect().toJSON(),
        sidebar: document.querySelector('.control-column').getBoundingClientRect().toJSON(),
      };
    });
    assert.equal(layout.overflow, false);
    assert.equal(layout.overlaps, false);
    if (phase === 'after') {
      assert.equal(await page.locator('.secondary-course-actions, .run-metrics').count(), 0);
      assert.equal(await page.locator('.course-heading h1').count(), 1);
      assert.equal(await page.locator('.control-column .run-controls button').count(), 2);
      if (width >= 960) assert.ok(Math.abs(layout.course.bottom - layout.sidebar.bottom) <= 8);
    }
    measurements.push(layout);
    if ([1440, 390, 320].includes(width)) {
      await page.screenshot({
        path: new URL(`${phase}-${width}.png`, directory).pathname.replace(/^\/([A-Z]:)/, '$1'),
        fullPage: true,
      });
      if (width === 1440) {
        await page.locator('.site-header').screenshot({
          path: new URL(`${phase}-header.png`, directory).pathname.replace(/^\/([A-Z]:)/, '$1'),
        });
      }
    }
  }
  if (phase === 'after') {
    const tile = page.locator('.tile-option').first();
    await tile.click();
    assert.equal(await tile.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
    assert.equal(await tile.getAttribute('aria-pressed'), 'false');
  }
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('dialog', { name: 'Help', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Puttential home' }).click();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL(`${phase}-checks.json`, directory),
    JSON.stringify({ errors, measurements }, null, 2) + '\n',
  );
  console.log(`${phase}: six viewport sizes, layout, home action, and Help dialog passed.`);
} finally {
  await browser.close();
}
