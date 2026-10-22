import { test, expect } from '@playwright/test';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

test('author, constrain, save, reopen and play the same course in both apps', async ({
  page,
  context,
}) => {
  const id = `browser-check-${Date.now()}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const file = path.join(process.cwd(), 'src/game/levels/authored', `${id}.json`);
  try {
    await page.goto('http://127.0.0.1:3001');
    await expect(page.getByRole('heading', { name: 'Untitled course', exact: true })).toBeVisible();
    async function number(label: string, value: string) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(value);
      await input.press('Tab');
    }
    await page.getByRole('textbox', { name: 'Level ID / filename', exact: true }).fill(id);
    await page.getByRole('textbox', { name: 'Level ID / filename', exact: true }).press('Tab');
    await page.getByRole('textbox', { name: 'Course name', exact: true }).fill('Geometry workshop');
    await page.getByRole('textbox', { name: 'Course name', exact: true }).press('Tab');
    await number('Board width', '20');
    await number('Board height', '12');
    const canvas = page.locator('.canvas-input');
    async function point(x: number, y: number) {
      const box = (await canvas.boundingBox())!;
      const scale = Math.min(box.width / 20.3, box.height / 12.3);
      return { x: box.x + box.width / 2 + x * scale, y: box.y + box.height / 2 - y * scale };
    }
    const obstacle = page
      .locator('.palette section')
      .filter({ has: page.getByRole('heading', { name: 'Obstacles', exact: true }) });
    await obstacle.getByRole('button', { name: 'Rectangle', exact: true }).click();
    const origin = await point(0, 0);
    await page.mouse.click(origin.x, origin.y);
    await expect(page.getByRole('textbox', { name: 'Object ID', exact: true })).toHaveValue(
      'rectangle-1',
    );
    const moved = await point(2, 1);
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(moved.x, moved.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue(
      '2',
    );
    await expect(page.getByRole('spinbutton', { name: 'Position Y', exact: true })).toHaveValue(
      '1',
    );
    await number('Position X', '50');
    await expect(page.locator('.error-message')).toContainText('outside the board');
    await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue(
      '2',
    );
    await number('Board width', '4');
    await expect(page.locator('.error-message')).toContainText('outside the board');
    await expect(page.getByRole('spinbutton', { name: 'Board width', exact: true })).toHaveValue(
      '20',
    );
    await number('Rotation (degrees)', '30');
    await page.getByLabel('Show vertex handles').check();
    await page.getByRole('button', { name: 'Add piece', exact: true }).click();
    await expect(page.getByLabel('Convex piece')).toHaveCount(1);
    await page.getByText('Replace with a custom outline', { exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Custom outline' })
      .fill('-1,-1\n1,-1\n1,0\n0,0\n0,1\n-1,1');
    await page.getByRole('button', { name: 'Apply outline', exact: true }).click();
    await expect(page.getByLabel('Convex piece').locator('option')).toHaveCount(4);
    // Native palette drag/drop uses the same placement and bounds path as click-to-place.
    const force = page.getByRole('button', { name: '→ Directional force', exact: true });
    await force.dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
    await expect(page.getByRole('textbox', { name: 'Object ID', exact: true })).toHaveValue(
      'uniform-1',
    );
    await number('Force density X', '2');
    await page.getByRole('button', { name: 'Save to repository', exact: true }).click();
    await expect(page.locator('.success-message')).toContainText(`${id}.json`);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(
      saved.staticBodies.find((o: { id: string }) => o.id === 'rectangle-1').pieces,
    ).toHaveLength(4);
    expect(saved.fields[0].force.density.x).toBe(2);
    expect(saved.dynamicBodies[0].pieces[0].shape).toEqual({ kind: 'circle', radius: 0.4 });
    expect(saved.formatVersion).toBe(1);
    expect(saved.editor).toBeUndefined();
    await mkdir('level-editor/screenshots', { recursive: true });
    await page.screenshot({ path: 'level-editor/screenshots/editor.png', fullPage: true });
    await page.getByRole('button', { name: 'Playtest', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.locator('.tile-option').click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: /Stop|Try again/, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
    await expect(page.locator('.save-state')).toHaveText('Saved to repository');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByLabel('Repository library').selectOption(id);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Geometry workshop', exact: true }),
    ).toBeVisible();
    const game = await context.newPage();
    game.on('pageerror', (e) => errors.push(e.message));
    await game.goto('http://127.0.0.1:3000');
    await expect(game.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await game.screenshot({ path: 'level-editor/screenshots/game.png', fullPage: true });
    await game.getByRole('button', { name: 'Settings', exact: true }).click();
    await game.getByLabel('Open local course').setInputFiles(file);
    await expect(
      game.getByRole('heading', {
        name: id
          .split('-')
          .map((w) => w[0]!.toUpperCase() + w.slice(1))
          .join(' '),
        exact: true,
      }),
    ).toBeVisible();
    await expect(game.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    const blocked = await page.request.post('http://127.0.0.1:3001/api/levels', {
      headers: { Origin: 'https://example.com' },
      data: { document: saved, revision: null },
    });
    expect(blocked.status()).toBe(403);
    expect(errors).toEqual([]);
  } finally {
    await unlink(file).catch(() => {});
    await unlink(file.replace('.json', '.editor.json')).catch(() => {});
  }
});

test('starter geometry, undo and malformed imports keep an editable document', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:3001');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByLabel('Game starters').selectOption('0');
  await expect(page.getByRole('heading', { name: 'Bar Around Corner', exact: true })).toBeVisible();
  await page.getByLabel('Game starters').selectOption('1');
  await expect(page.getByRole('heading', { name: 'Radial Relay', exact: true })).toBeVisible();
  await page.locator('.object-list').getByRole('button', { name: 'ball', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Radius', exact: true })).toHaveValue('0.35');
  await expect(page.getByRole('spinbutton', { name: 'Vertex 1 X', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.locator('.object-list').getByRole('button', { name: 'launch', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Vertex 6 X', exact: true })).toHaveValue('-6');
  const x = page.getByRole('spinbutton', { name: 'Position X', exact: true });
  await x.fill('0.5');
  await x.press('Tab');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.object-list').getByRole('button', { name: 'launch', exact: true }).click();
  await expect(x).toHaveValue('0');
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.locator('.error-message')).toContainText('Unsupported document version');
  await expect(page.getByRole('heading', { name: 'Radial Relay', exact: true })).toBeVisible();
});

test('vertex dragging, zoom, pan and gesture cancellation preserve world coordinates', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:3001');
  const canvas = page.locator('.canvas-input');
  let zoom = 1,
    panX = 0;
  async function point(x: number, y: number) {
    const b = (await canvas.boundingBox())!;
    const scale = Math.min(b.width / 15.1, b.height / 8.8) * zoom;
    return { x: b.x + b.width / 2 + x * scale + panX, y: b.y + b.height / 2 - y * scale };
  }
  const obstacle = page
    .locator('.palette section')
    .filter({ has: page.getByRole('heading', { name: 'Obstacles', exact: true }) });
  await obstacle.getByRole('button', { name: 'Square', exact: true }).click();
  let p = await point(0, 0);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel('Show vertex handles').check();
  p = await point(-0.5, -0.5);
  let q = await point(-1, -0.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Vertex 1 X', exact: true })).toHaveValue('-1');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  zoom = 1.2;
  p = await point(0, 0);
  q = await point(1, 0.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('1');
  await expect(page.getByRole('spinbutton', { name: 'Position Y', exact: true })).toHaveValue(
    '0.5',
  );
  p = await point(1, 0.5);
  await page.keyboard.down('Alt');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 70, p.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  panX = 70;
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('1');
  p = await point(1, 0.5);
  q = await point(2, 0.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('1');
});

test('unsupported browser recovery is retained until explicitly discarded', async ({ page }) => {
  const original = JSON.stringify({ version: 99, preciousDraft: 'preserve this' });
  await page.addInitScript(
    (value) => localStorage.setItem('puttential-editor-v1', value),
    original,
  );
  await page.goto('http://127.0.0.1:3001');
  await expect(page.locator('.recovery-banner')).toContainText('original draft is preserved');
  const input = page.getByRole('textbox', { name: 'Course name', exact: true });
  await input.fill('New work');
  await input.press('Tab');
  expect(await page.evaluate(() => localStorage.getItem('puttential-editor-v1'))).toBe(original);
  await page.getByRole('button', { name: 'Discard incompatible draft', exact: true }).click();
  await expect(page.locator('.recovery-banner')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('puttential-editor-v1')!).editor.name),
    )
    .toBe('New work');
});
