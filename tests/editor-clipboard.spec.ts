import { test, expect } from '@playwright/test';

test('object copy and paste shortcuts preserve the copied state and respect text focus', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('http://127.0.0.1:3001');
  const objects = page.locator('.object-list');
  await objects.getByRole('button', { name: 'ball', exact: true }).click();
  await page.keyboard.press('Control+c');
  await expect(page.locator('.success-message')).toContainText('Copied ball');
  const position = page.getByRole('spinbutton', { name: 'Position X', exact: true });
  await position.fill('-3');
  await position.press('Tab');
  await objects.getByRole('button', { name: 'ball', exact: true }).click();
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('textbox', { name: 'Object ID', exact: true })).toHaveValue('ball-1');
  await expect(position).toHaveValue('-4');
  await page.keyboard.press('Control+v');
  await expect(objects.getByRole('button', { name: 'ball-2', exact: true })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(objects.getByRole('button', { name: 'ball-2', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(objects.getByRole('button', { name: 'ball-2', exact: true })).toBeVisible();
  // Command shortcuts follow the same path, including when a different object is selected.
  await objects.getByRole('button', { name: 'ball-1', exact: true }).click();
  await page.keyboard.press('Meta+c');
  await page.keyboard.press('Meta+v');
  await expect(page.getByRole('textbox', { name: 'Object ID', exact: true })).toHaveValue(
    'ball-1-1',
  );
  const id = page.getByRole('textbox', { name: 'Object ID', exact: true });
  for (const key of ['c', 'v']) {
    const untouched = await id.evaluate(
      (input, key) =>
        input.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      key,
    );
    expect(untouched).toBe(true);
  }
  // The tab's copied object survives opening a new course.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.keyboard.press('Control+v');
  await expect(objects.getByRole('button', { name: 'ball-1-1', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
