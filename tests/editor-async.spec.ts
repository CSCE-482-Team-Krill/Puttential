import { test, expect } from '@playwright/test';
import { freshDocument } from '../src/editor/model';

test('opening a delayed library document asks before replacing edits made while loading', async ({
  page,
}) => {
  const replacement = freshDocument();
  replacement.editor.name = 'Loaded replacement';
  await page.route('**/api/levels', async (route) => {
    const request = route.request();
    await route.fulfill({
      json:
        request.method() === 'GET'
          ? { levels: ['untitled-course'] }
          : { document: request.postDataJSON().document, revision: 'saved-revision' },
    });
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/levels?id=*', async (route) => {
    await pending;
    await route.fulfill({ json: { document: replacement, revision: 'loaded-revision' } });
  });
  await page.goto('http://127.0.0.1:3001/');
  await page.getByRole('button', { name: 'Save to repository', exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('Saved to repository');
  await page.getByLabel('Repository library').selectOption('untitled-course');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Course name', exact: true });
  await name.fill('Edits made during loading');
  await name.press('Tab');
  let confirmed = false;
  page.on('dialog', async (dialog) => {
    confirmed = true;
    await dialog.dismiss();
  });
  release();
  await expect(page.getByRole('button', { name: 'Save to repository', exact: true })).toBeEnabled();
  expect(confirmed).toBe(true);
  await expect(name).toHaveValue('Edits made during loading');
  await expect(page.locator('.save-state')).toHaveText('Unsaved changes');
});
