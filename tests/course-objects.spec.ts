import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function point(page: Page, x: number, y: number) {
  const b = (await page.locator('.canvas-input').boundingBox())!;
  const scale = Math.min(b.width / 15.1, b.height / 8.8);
  return { x: b.x + b.width / 2 + x * scale, y: b.y + b.height / 2 - y * scale };
}

test('water and lava authoring, playtest failure feedback, and fixed course objects', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  for (const [name, failure] of [
    ['≈ Water', 'Ball sank in water'],
    ['♨ Lava', 'Ball burnt by lava'],
  ]) {
    await page.goto('http://127.0.0.1:3001');
    if (await page.getByRole('button', { name: 'Discard recovery', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Discard recovery', exact: true }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: name!, exact: true }).click();
    const p = await point(page, -4, 0);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByLabel('Enabled at start')).toBeChecked();
    await page.getByRole('button', { name: 'Playtest', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(page.locator('.tile-option')).toHaveCount(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(failure!);
    await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
    await expect(page.getByLabel('Enabled at start')).toBeChecked();
  }
  expect(errors).toEqual([]);
});

test('portal pairs and simple hazard graphics are available in the editor', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3001');
  for (const [name, x, y] of [
    ['≈ Water', -2, -2],
    ['♨ Lava', 2, -2],
    ['◉ Portal pair', -1, 1.5],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    const p = await point(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  const list = page.locator('.object-list');
  await expect(list.getByRole('button', { name: 'portal-1', exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'portal-1-exit', exact: true })).toBeVisible();
  await expect(page.getByText('Both ends are linked.', { exact: false })).toBeVisible();
  const screenshot = testInfo.outputPath('puttential-course-objects.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('Course objects', {
    path: screenshot,
    contentType: 'image/png',
  });
  await list
    .getByRole('button', { name: 'portal-1-exit', exact: true })
    .click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(
    page.getByRole('heading', { name: '2 objects selected', exact: true }),
  ).toBeVisible();
  await list.getByRole('button', { name: 'portal-1-1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Portal pair ID', exact: true })).toHaveValue(
    'portal-1-copy-1',
  );
  await expect(page.getByText('Both ends are linked.', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a lava rim graze remains playable until the center enters the surface', async ({ page }) => {
  const { freshDocument, place, presets, edit } = await import('../level-editor/editor/model');
  const placed = place(
    freshDocument(),
    presets.find((p) => p.id === 'fields:lava')!,
    { x: -2.8, y: 0 },
  );
  const doc = edit(placed.doc, (d) => {
    d.level.dynamicBodies[0]!.linearVelocity = { x: 0.2, y: 0 };
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:3001');
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'lava-center-entry.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc.level)),
    });
  await page.getByRole('button', { name: 'Playtest', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // The ball's rim already overlaps the lava at launch; its center takes one second to enter.
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Ball burnt by lava');
});
