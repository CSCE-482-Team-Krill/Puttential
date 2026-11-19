import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const app of ['repository', 'website'] as const) {
  test(`${app}: learn the editor without changing the authored course or recovery draft`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
    if (app === 'website') {
      await page.route('**/api/**', (route) =>
        route.fulfill({ status: 404, json: { error: 'Unavailable fixture' } }),
      );
    }
    await page.goto(`http://127.0.0.1:${app === 'website' ? 3000 : 3001}`);
    if (app === 'website') await page.getByRole('button', { name: 'Editor', exact: true }).click();
    const recoveryKey =
      app === 'website' ? 'puttential-website-editor-recovery-v1' : 'puttential-editor-v1';
    // Recovery is written after hydration; don't fill a server-rendered input before React owns it.
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), recoveryKey))
      .not.toBeNull();
    const courseName = page.getByRole('textbox', { name: 'Course name', exact: true });
    await courseName.fill('Keep my work');
    await courseName.press('Tab');
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), recoveryKey))
      .toContain('Keep my work');
    const recovery = await page.evaluate((key) => localStorage.getItem(key), recoveryKey);
    const tutorialButton = page.getByRole('button', { name: 'Tutorial', exact: true });
    await mkdir('artifacts/editor-tutorial', { recursive: true });
    await page.screenshot({ path: `artifacts/editor-tutorial/${app}-before.png` });
    await tutorialButton.click();
    const dialog = page.getByRole('dialog', { name: 'Build your first course' });
    const next = dialog.getByRole('button', { name: 'Next', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[aria-current="step"]')).toHaveText('1Course');
    await next.click();
    await expect(next).toBeDisabled();
    await dialog.getByRole('button', { name: 'Rectangle', exact: true }).click();
    const canvas = dialog.locator('.canvas-input');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width / 2, y: box.height / 4 } });
    await expect(next).toBeEnabled();
    await next.click();
    await expect(next).toBeDisabled();
    const width = dialog.getByRole('spinbutton', { name: 'Width', exact: true });
    await width.fill('3');
    await width.press('Enter');
    await expect(width).toHaveValue('3');
    await expect(next).toBeEnabled();
    await page.screenshot({ path: `artifacts/editor-tutorial/${app}-adjust.png` });
    await next.click();
    await dialog.getByRole('button', { name: 'Repulsor', exact: true }).click();
    await canvas.click({ position: { x: box.width / 5, y: box.height / 2 } });
    await expect(next).toBeEnabled();
    await next.click();
    await dialog.getByRole('button', { name: 'Open Playtest', exact: true }).click();
    await expect(dialog.locator('.tile-option')).toHaveCount(1);
    await dialog.locator('.tile-option').click();
    await dialog.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /Stop|Try again/, exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/editor-tutorial/${app}-playtest.png` });
    await dialog.getByRole('button', { name: 'Return to editor', exact: true }).click();
    await expect(next).toBeEnabled();
    await next.click();
    await expect(
      dialog.getByRole('heading', {
        name: app === 'website' ? 'Save draft' : 'Save to repository',
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog).toContainText(
      app === 'website' ? 'publishing to Community' : 'does not publish it',
    );
    await dialog.getByRole('button', { name: 'Start building', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(courseName).toHaveValue('Keep my work');
    expect(await page.evaluate((key) => localStorage.getItem(key), recoveryKey)).toBe(recovery);
    await expect(page.locator('.editor-heading')).toContainText('5 objects');
    await tutorialButton.click();
    await expect(dialog.locator('[aria-current="step"]')).toHaveText('1Course');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(tutorialButton).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('first visit opens once; skipping, replay, focus containment and a narrow screen work', async ({
  page,
}) => {
  // Exercise first-visit behavior just as a non-automated browser would.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'webdriver', { get: () => false }),
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('http://127.0.0.1:3001');
  const dialog = page.getByRole('dialog', { name: 'Build your first course' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close editor tutorial' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Skip tutorial' }).click();
  expect(await page.evaluate(() => localStorage.getItem('puttential-editor-tutorial-v1'))).toBe(
    'seen',
  );
  await page.reload();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Tutorial', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await mkdir('artifacts/editor-tutorial', { recursive: true });
  await page.screenshot({ path: 'artifacts/editor-tutorial/narrow.png' });
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Skip step', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Make it fit your idea' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
