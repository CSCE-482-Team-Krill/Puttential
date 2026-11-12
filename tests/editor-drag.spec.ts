import { test, expect } from '@playwright/test';

test('undo during a drag cannot recommit the obsolete document on pointer release', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:3001/');
  await page.getByRole('textbox', { name: 'Course name', exact: true }).fill('Obsolete drag base');
  await page.getByRole('textbox', { name: 'Course name', exact: true }).press('Tab');
  await page.locator('.object-list').getByRole('button', { name: 'ball', exact: true }).click();
  const box = (await page.locator('.canvas-input').boundingBox())!;
  const scale = Math.min(box.width / 15.1, box.height / 8.8);
  const start = { x: box.x + box.width / 2 - 4 * scale, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + scale, start.y, { steps: 4 });
  await page.keyboard.press('Control+z');
  await page.mouse.up();
  await page.getByRole('button', { name: 'Course properties', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toHaveValue(
    'Untitled course',
  );
  await page.locator('.object-list').getByRole('button', { name: 'ball', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toHaveValue('-4');
});
