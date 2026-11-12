import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshDocument } from '../src/editor/model';
import { LEVEL_COLOR_SCHEMES, validateDocument } from '../src/game';
import { levelPalette, levelPalettes } from '../src/frontend/level-colors';
import { defaultRules } from '../src/game/run-evaluation';
import { puzzleFixture, playerFixture, progressFixture } from './iteration-two-fixtures';

function fixture() {
  const document = freshDocument();
  document.level.fields = [
    {
      id: 'water',
      position: { x: 0, y: 2 },
      angle: 0,
      enabled: true,
      shape: { kind: 'rectangle', width: 2, height: 1.5 },
      force: { kind: 'water', drag: 2, sinkSpeed: 0.06 },
    },
    {
      id: 'lava',
      position: { x: 0, y: -2 },
      angle: 0,
      enabled: true,
      shape: { kind: 'rectangle', width: 2, height: 1.5 },
      force: { kind: 'lava' },
    },
    ...[
      { id: 'entry', x: 1.5, y: 0 },
      { id: 'exit', x: 3, y: 2.5 },
    ].map((end) => ({
      id: end.id,
      position: { x: end.x, y: end.y },
      angle: 0,
      enabled: true,
      shape: { kind: 'rectangle' as const, width: 1.2, height: 1.6 },
      force: { kind: 'portal' as const, pairId: 'matching', rotateVelocity: false },
    })),
  ];
  return validateDocument(document);
}

async function pixel(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (element, point) => {
      const c = element as HTMLCanvasElement;
      const scale = Math.min(c.width / 15.1, c.height / 8.8);
      return [
        ...c
          .getContext('2d')!
          .getImageData(
            Math.round(c.width / 2 + point.x * scale),
            Math.round(c.height / 2 - point.y * scale),
            1,
            1,
          ).data,
      ];
    },
    { x, y },
  );
}
function rgb(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

test('schemes recolor the background and walls while objects retain their colors; undo works', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:3001');
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'color-check.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  const canvas = page.locator('.editor-course canvas');
  await expect(page.getByRole('radio', { name: 'Classic green', exact: true })).toBeChecked();
  await expect.poll(async () => (await pixel(canvas, -1, 2.15))[3]).toBeGreaterThan(0);
  await expect.poll(async () => (await pixel(canvas, -1, -2.15))[3]).toBeGreaterThan(0);
  const points = [
    [-4, 0.15],
    [-1, 2.15],
    [-1, -2.15],
    [0.9, 0.15],
    [4, 0.15],
  ];
  const original = await Promise.all(points.map(([x, y]) => pixel(canvas, x!, y!)));
  await page.screenshot({ path: testInfo.outputPath('classic-green-editor.png'), fullPage: true });
  for (const scheme of LEVEL_COLOR_SCHEMES) {
    const palette = levelPalettes[scheme];
    await page.getByRole('radio', { name: palette.label, exact: true }).check();
    await expect(canvas).toHaveAttribute('data-color-scheme', scheme);
    await expect
      .poll(async () => (await pixel(canvas, -7.15, 2.5)).slice(0, 3))
      .toEqual(rgb(palette.walls));
    const actualBackground = await canvas.evaluate((c) => getComputedStyle(c).backgroundColor);
    expect(actualBackground).toBe(`rgb(${rgb(palette.background).join(', ')})`);
    expect(await Promise.all(points.map(([x, y]) => pixel(canvas, x!, y!)))).toEqual(original);
    if (scheme === 'black' || scheme === 'yellow')
      await page.screenshot({ path: testInfo.outputPath(`${scheme}-editor.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-color-scheme', 'black');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-color-scheme', 'yellow');
});

test('selected scheme survives export/import, playtest and recovery', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:3001');
  await page.getByRole('radio', { name: 'Sandstone', exact: true }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const file = await download;
  const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(exported.level.colorScheme).toBe('sandstone');
  await page.getByRole('button', { name: 'Playtest', exact: true }).click();
  const canvas = page.locator('.playtest-course canvas');
  await expect(canvas).toHaveAttribute('data-color-scheme', 'sandstone');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-color-scheme', 'sandstone');
  await page.screenshot({ path: testInfo.outputPath('sandstone-playtest.png'), fullPage: true });
  await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Sandstone', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Classic green', exact: true }).check();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'imported-color.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole('radio', { name: 'Sandstone', exact: true })).toBeChecked();
});

test('custom primary and secondary colors support live preview, undo, export and playtest', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:3001');
  await page.getByRole('radio', { name: 'Black', exact: true }).check();
  await page.getByRole('radio', { name: 'Custom', exact: true }).check();
  const primary = page.getByLabel('Primary color (background)', { exact: true });
  const secondary = page.getByLabel('Secondary color (walls)', { exact: true });
  await expect(primary).toHaveValue(levelPalettes.black.background);
  await expect(secondary).toHaveValue(levelPalettes.black.walls);
  async function pick(input: Locator, value: string) {
    await input.evaluate((element, color) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        element,
        color,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await expect(input).toHaveValue(value);
  }
  await pick(primary, '#243045');
  await pick(secondary, '#ffd966');
  const canvas = page.locator('.editor-course canvas');
  await expect(canvas).toHaveAttribute('data-color-scheme', 'custom');
  await expect(canvas).toHaveCSS('background-color', 'rgb(36, 48, 69)');
  await expect
    .poll(async () => (await pixel(canvas, -7.15, 2.5)).slice(0, 3))
    .toEqual([255, 217, 102]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(secondary).toHaveValue(levelPalettes.black.walls);
  await expect(primary).toHaveValue('#243045');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(secondary).toHaveValue('#ffd966');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.level.colorScheme).toEqual({
    kind: 'custom',
    primary: '#243045',
    secondary: '#ffd966',
  });
  await page.screenshot({ path: testInfo.outputPath('custom-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Playtest', exact: true }).click();
  await expect(page.locator('.playtest-course canvas')).toHaveCSS(
    'background-color',
    'rgb(36, 48, 69)',
  );
  await expect
    .poll(async () =>
      (await pixel(page.locator('.playtest-course canvas'), -7.15, 2.5)).slice(0, 3),
    )
    .toEqual([255, 217, 102]);
  await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(primary).toHaveValue('#243045');
  await expect(secondary).toHaveValue('#ffd966');
  await page.getByRole('radio', { name: 'Yellow', exact: true }).check();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'custom-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole('radio', { name: 'Custom', exact: true })).toBeChecked();
  await expect(primary).toHaveValue('#243045');
  await expect(secondary).toHaveValue('#ffd966');
});

for (const colorScheme of [
  'lagoon',
  { kind: 'custom', primary: '#243045', secondary: '#ffd966' },
] as const) {
  const name = typeof colorScheme === 'string' ? colorScheme : 'custom';
  test(`the daily game renders the authored ${name} color scheme`, async ({ page }, testInfo) => {
    const puzzle = puzzleFixture();
    puzzle.configuration = { ...freshDocument().level, colorScheme };
    puzzle.rules = defaultRules(puzzle.configuration);
    await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 404, json: { error: 'Unavailable fixture' } }),
    );
    await page.route('**/api/me', (route) => route.fulfill({ json: { player: playerFixture } }));
    await page.route('**/api/puzzles/today', (route) => route.fulfill({ json: puzzle }));
    await page.route('**/api/me/progress?*', (route) =>
      route.fulfill({
        json: { progress: progressFixture(puzzle), availability: puzzle.availability },
      }),
    );
    await page.goto('http://127.0.0.1:3000');
    const canvas = page.locator('main.dashboard canvas');
    await expect(canvas).toHaveAttribute('data-color-scheme', name);
    await expect
      .poll(async () => (await pixel(canvas, -7.15, 2.5)).slice(0, 3))
      .toEqual(rgb(levelPalette(colorScheme).walls));
    await page.screenshot({ path: testInfo.outputPath(`${name}-game.png`), fullPage: true });
  });
}
