import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { freshDocument, place, presets, edit } from '../level-editor/editor/model';

function fixture() {
  let doc = freshDocument();
  for (const [preset, x, y] of [
    ['fields:portal', -2, 1.5],
    ['fields:portal', -2, -1.5],
    ['fields:water', 3, 1.5],
    ['fields:lava', 3, -1.5],
  ] as const)
    doc = place(
      doc,
      presets.find((p) => p.id === preset)!,
      { x, y },
    ).doc;
  return doc;
}
async function open(page: Page, doc = fixture()) {
  await page.goto('http://127.0.0.1:3001');
  page.on('dialog', (d) => d.accept());
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'portal-textures.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc.level)),
    });
  await expect(
    page.locator('.object-list').getByRole('button', { name: 'portal-2-exit', exact: true }),
  ).toBeVisible();
}
async function colorAt(
  page: Page,
  x: number,
  y: number,
  rgb?: number[],
  selector = '.editor-course canvas',
) {
  return page.locator(selector).evaluate(
    (element, { x, y, rgb }) => {
      const canvas = element as HTMLCanvasElement;
      const scale = Math.min(canvas.width / 15.1, canvas.height / 8.8);
      const px = Math.round(canvas.width / 2 + x * scale),
        py = Math.round(canvas.height / 2 - y * scale);
      const data = canvas.getContext('2d')!.getImageData(px - 2, py - 2, 5, 5).data;
      if (rgb) {
        for (let i = 0; i < data.length; i += 4)
          if (rgb.every((n, k) => Math.abs(data[i + k]! - n) < 8)) return true;
        return false;
      }
      return [...data.slice(48, 51)];
    },
    { x, y, rgb },
  );
}

test('selected portal retains its partner color, multiple pairs differ, and timing is editable', async ({
  page,
}) => {
  await open(page);
  const objects = page.locator('.object-list');
  await objects.getByRole('button', { name: 'portal-1', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Teleport delay (seconds)', exact: true }),
  ).toHaveValue('0.25');
  await expect(
    page.getByRole('spinbutton', { name: 'Teleport cooldown (seconds)', exact: true }),
  ).toHaveValue('0.75');
  await expect.poll(() => colorAt(page, -2.6, 1.5, [117, 156, 225])).toBe(true);
  await expect.poll(() => colorAt(page, -0.6, 1.5, [117, 156, 225])).toBe(true);
  await expect.poll(() => colorAt(page, -2.6, -1.5, [173, 131, 207])).toBe(true);
  await expect.poll(() => colorAt(page, -0.6, -1.5, [173, 131, 207])).toBe(true);
  const delay = page.getByRole('spinbutton', { name: 'Teleport delay (seconds)', exact: true });
  await delay.fill('0.4');
  await delay.press('Tab');
  await objects.getByRole('button', { name: 'portal-1-exit', exact: true }).click();
  await expect(delay).toHaveValue('0.25');
  await objects.getByRole('button', { name: 'portal-1', exact: true }).click();
  await expect(delay).toHaveValue('0.4');
  await page.screenshot({ path: '/tmp/puttential-portal-textures-editor.png', fullPage: true });
});

test('shared textures load and lava leaves a black stationary object visible beneath the surface', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const loaded = new Set<string>();
  page.on('response', (response) => {
    if (response.ok())
      for (const kind of ['water', 'lava'])
        if (response.url().includes(`${kind}-tile.`)) loaded.add(kind);
  });
  const doc = edit(fixture(), (draft) => {
    draft.level.dynamicBodies[0]!.position = { x: 3, y: -1.5 };
    draft.level.dynamicBodies[0]!.linearVelocity = { x: 2, y: 0 };
    const waterBall = structuredClone(draft.level.dynamicBodies[0]!);
    waterBall.id = 'water-ball';
    waterBall.pieces[0]!.id = 'water-ball-piece';
    waterBall.position = { x: 3, y: 1.5 };
    draft.level.dynamicBodies.push(waterBall);
  });
  await open(page, doc);
  await expect.poll(() => loaded.size).toBe(2);
  await page.getByRole('button', { name: 'Playtest', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Ball burnt by lava');
  const rgb = (await colorAt(page, 3, -1.5, undefined, '.playtest-course canvas')) as number[];
  expect(rgb[0]).toBeLessThan(150);
  expect(rgb[1]).toBeLessThan(95);
  expect(rgb[2]).toBeLessThan(90);
  await page.screenshot({ path: '/tmp/puttential-lava-charred.png', fullPage: true });
  await testInfo.attach('Charred ball and submerged water ball', {
    path: '/tmp/puttential-lava-charred.png',
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
