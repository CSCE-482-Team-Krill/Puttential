import { test, expect } from '@playwright/test';
import { starterLevels } from '../src/game/levels/starters';

test('migrated Figma modals retain focus, keyboard controls and preferences', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/modal-preview');
  for (const [button, title] of [
    ['Help', 'Help'],
    ['Profile', 'Profile'],
    ['Leaderboard', 'Leaderboard'],
    ['Calendar', 'Calendar'],
    ['Settings', 'Settings'],
  ]) {
    const trigger = page.getByRole('button', { name: button!, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: title! });
    await expect(dialog).toBeVisible();
    if (button === 'Settings') {
      await dialog.getByRole('switch', { name: 'Reduced motion' }).click();
      await expect(page.locator('.site-wrap')).toHaveClass(/reduce-motion/);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.reload();
  await expect(page.locator('.site-wrap')).toHaveClass(/reduce-motion/);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByText('How to play', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Press Play');
  await page.keyboard.press('Escape');
  for (const width of [320, 390, 700, 760, 850, 959, 960, 961, 1050, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const brand = (await page.locator('.brand').boundingBox())!;
    const nav = (await page.getByRole('navigation').boundingBox())!;
    const header = await page.locator('.site-header').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        bottom: bounds.bottom,
        right: bounds.right,
        padding: parseFloat(getComputedStyle(element).paddingRight),
      };
    });
    if (width >= 960 || nav.y < brand.y + brand.height - 1) {
      expect(nav.x).toBeGreaterThanOrEqual(brand.x + brand.width);
      expect(Math.abs(nav.y + nav.height / 2 - (brand.y + brand.height / 2))).toBeLessThan(2);
    } else {
      expect(brand.y + brand.height).toBeLessThanOrEqual(nav.y + 1);
    }
    for (const box of [brand, nav]) {
      expect(box.x).toBeGreaterThanOrEqual(header.left);
      expect(box.x + box.width).toBeLessThanOrEqual(header.right);
      expect(box.y).toBeGreaterThanOrEqual(header.top);
      expect(box.y + box.height).toBeLessThanOrEqual(header.bottom);
    }
    const controlBoxes = [];
    for (const name of ['Calendar', 'Leaderboard', 'Settings', 'Profile', 'Help']) {
      const control = page.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
      controlBoxes.push(box);
    }
    controlBoxes.sort((a, b) => a.x - b.x);
    for (let index = 1; index < controlBoxes.length; index++) {
      expect(
        controlBoxes[index]!.x - (controlBoxes[index - 1]!.x + controlBoxes[index - 1]!.width),
      ).toBeGreaterThanOrEqual(4);
    }
    expect(Math.abs(nav.x + nav.width - (header.right - header.padding - 1))).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
  }
});

test('legacy daily data is rejected and legacy courses never use legacy writes', async ({
  page,
}) => {
  let posts = 0;
  await page.route('**/api/**', (route) => {
    if (route.request().method() === 'POST') posts++;
    return route.fulfill({ status: 404, json: { error: 'Unavailable fixture' } });
  });
  await page.route('**/api/puzzles/today', (route) =>
    route.fulfill({
      json: {
        id: 'legacy-puzzle',
        date: '2026-10-15',
        seed: 'daily',
        difficulty: 1,
        configuration: starterLevels[0],
      },
    }),
  );
  await page.goto('http://127.0.0.1:3000');
  await expect(page.locator('.api-notice')).toContainText('incompatible puzzle data');
  await page.getByRole('button', { name: 'Play legacy course', exact: true }).click();
  await expect(page.locator('.challenge-label')).toHaveText('Legacy course');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'So close' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Legacy course');
  await expect(page.getByRole('dialog')).not.toContainText(/unranked|not submitted/i);
  await page.getByRole('button', { name: 'Copy result', exact: true }).click();
  await expect(page.getByLabel('Result text')).toHaveValue(/Bar Around Corner — Legacy course/);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await expect(page.locator('.runs-content')).toContainText('Legacy course');
  await expect(page.locator('.runs-content')).not.toContainText(/unranked|not submitted/i);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Legacy courses', exact: true })).toBeVisible();
  await expect(page.locator('.legacy-course')).toHaveCount(2);
  await page.getByRole('button', { name: 'Radial Relay', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Radial Relay');
  await expect(page.locator('.challenge-label')).toHaveText('Legacy course');
  expect(posts).toBe(0);
});
