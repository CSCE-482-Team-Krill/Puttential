import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function point(page: Page, x: number, y: number) {
  const b = (await page.locator('.canvas-input').boundingBox())!;
  const scale = Math.min(b.width / 15.1, b.height / 8.8);
  return { x: b.x + b.width / 2 + x * scale, y: b.y + b.height / 2 - y * scale };
}
async function square(page: Page) {
  await page.goto('http://127.0.0.1:3001');
  const section = page
    .locator('.palette section')
    .filter({ has: page.getByRole('heading', { name: 'Obstacles', exact: true }) });
  await section.getByRole('button', { name: 'Square', exact: true }).click();
  const p = await point(page, 0, 0);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('textbox', { name: 'Object ID', exact: true })).toHaveValue(
    'square-1',
  );
}

test('Ctrl-click toggles canvas and object-list selections; a group drags together', async ({
  page,
}) => {
  await square(page);
  const ball = await point(page, -4, 0);
  await page.keyboard.down('Control');
  await page.mouse.click(ball.x, ball.y);
  await page.keyboard.up('Control');
  await expect(
    page.getByRole('heading', { name: '2 objects selected', exact: true }),
  ).toBeVisible();
  const list = page.locator('.object-list');
  await expect(list.getByRole('button', { name: 'ball', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(list.getByRole('button', { name: 'square-1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const start = await point(page, 0, 0),
    end = await point(page, 1, 1);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await list.getByRole('button', { name: 'ball', exact: true }).click({ modifiers: ['Control'] });
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('1');
  await list.getByRole('button', { name: 'ball', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('-3');
});

test('right-drag selects an enclosed region and Escape cancels a region gesture', async ({
  page,
}) => {
  await square(page);
  const a = await point(page, -5, -1),
    b = await point(page, 1, 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await expect(
    page.getByRole('heading', { name: '2 objects selected', exact: true }),
  ).toBeVisible();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(a.x + 10, a.y + 10);
  await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'right' });
  await expect(
    page.getByRole('heading', { name: '2 objects selected', exact: true }),
  ).toBeVisible();
});

test('Ctrl+C and Ctrl+V paste a selected group; undo, redo and delete operate on the whole group', async ({
  page,
}) => {
  await square(page);
  const objects = page.locator('.object-list');
  await objects
    .getByRole('button', { name: 'ball', exact: true })
    .click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+c');
  await expect(page.locator('.success-message')).toContainText('Copied 2 objects');
  await page.keyboard.press('Control+v');
  await expect(
    page.getByRole('heading', { name: '2 objects selected', exact: true }),
  ).toBeVisible();
  await expect(objects.getByRole('button', { name: 'ball-1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(objects.getByRole('button', { name: 'square-1-1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Control+z');
  await expect(objects.getByRole('button', { name: 'ball-1', exact: true })).toHaveCount(0);
  await expect(objects.getByRole('button', { name: 'square-1-1', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(objects.getByRole('button', { name: 'ball-1', exact: true })).toBeVisible();
  await page.keyboard.press('Control+v');
  await expect(objects.getByRole('button', { name: 'ball-2', exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(objects.getByRole('button', { name: 'ball-2', exact: true })).toHaveCount(0);
  await expect(objects.getByRole('button', { name: 'square-1-2', exact: true })).toHaveCount(0);
});
