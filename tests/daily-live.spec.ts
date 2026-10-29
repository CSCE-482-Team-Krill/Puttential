import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('real daily browser flow persists a verified result and shares it across two guests', async ({
  browser,
}) => {
  test.setTimeout(90000);
  test.skip(
    !process.env.TEST_DATABASE_URL,
    'Set TEST_DATABASE_URL to the migrated acceptance database. No HTTP fixtures are used.',
  );
  const first = await browser.newContext(),
    second = await browser.newContext();
  try {
    for (const [context, nickname] of [
      [first, 'Acceptance One'],
      [second, 'Acceptance Two'],
    ] as const) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('http://127.0.0.1:3000');
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Profile', exact: true }).click();
      await page.getByLabel('Nickname', { exact: true }).fill(nickname);
      await page.getByRole('button', { name: 'Save nickname', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Nickname saved.');
      await page.keyboard.press('Escape');
      await page.locator('.tile-option').filter({ hasText: 'Gentle' }).click();
      await expect(page.getByLabel('Selected tile angle')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Rotate (left|right)$/ })).toHaveCount(0);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Nice work!' })).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByRole('dialog')).toContainText('Saved and verified.', {
        timeout: 15000,
      });
      await page.keyboard.press('Escape');
      await page.reload();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Profile', exact: true }).click();
      await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue(nickname);
      await expect(page.getByRole('dialog')).toContainText('First verified solve: run #1');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText(nickname);
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: 'Runs', exact: true }).click();
      await page.getByRole('button', { name: 'Copy result', exact: true }).click();
      await expect(page.getByLabel('Result text')).toHaveValue(/Verified/);
      expect((await page.getByLabel('Result text').boundingBox())!.width).toBeGreaterThan(180);
      expect(
        await page.locator('.runs-panel').evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      expect(await page.getByLabel('Result text').inputValue()).not.toMatch(/commands|xQ|angleQ/);
      await mkdir('artifacts/iteration-two-completion', { recursive: true });
      await page.screenshot({
        path: `artifacts/iteration-two-completion/${nickname === 'Acceptance One' ? 'verified-desktop' : 'second-guest'}.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    }
    const page = first.pages()[0]!;
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('2026');
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await page.locator('.archive-course').first().boundingBox())!.width).toBeGreaterThan(
      150,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: 'artifacts/iteration-two-completion/archive-mobile.png',
      fullPage: true,
    });
    const today = (
      await (await first.request.get('http://127.0.0.1:3000/api/puzzles/today')).json()
    ).date;
    for (let days = 1; days <= 3; days++) {
      const date = new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000)
        .toISOString()
        .slice(0, 10);
      await page.locator('.archive-row').filter({ hasText: date }).click();
      await expect(page).toHaveURL(new RegExp(`date=${date}`));
      await page.reload();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await page.locator('.tile-option').filter({ hasText: 'Gentle' }).click();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Nice work!' })).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByRole('dialog')).toContainText(
        'Saved and verified outside daily window.',
        {
          timeout: 15000,
        },
      );
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    }
  } finally {
    await first.close();
    await second.close();
  }
});
