import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { communityPublishingFixture } from './community-publishing-fixtures';
import { defaultRules } from '../src/game/run-evaluation';

test('unsupported community geometry is explained before the creator attempts publication', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }),
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Level editor', exact: true });
  const { document } = communityPublishingFixture();
  document.level.gravity = { x: 21, y: 0 };
  await editor.locator('input[type=file]').setInputFiles({
    name: 'unsupported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(document.editor.name);
  await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Return to the editor before publishing');
  await expect(editor.getByRole('alert')).toContainText('level.gravity');
  await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toHaveCount(0);
});

test('a delayed daily failure cannot replace a community map loading state or notice', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
  const { document } = communityPublishingFixture();
  const map = {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Independent community map',
    description: '',
    creatorName: 'Test creator',
    createdAt: '2026-11-09T00:00:00.000Z',
    configuration: document.level,
    rules: defaultRules(document.level),
  };
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }),
  );
  let failDaily!: () => void;
  const dailyReady = new Promise<void>((resolve) => {
    failDaily = resolve;
  });
  await page.route('**/api/puzzles/today', async (route) => {
    await dailyReady;
    await route.fulfill({ status: 503, json: { error: 'Daily unavailable' } });
  });
  await page.route(`**/api/community/${map.id}`, (route) => route.fulfill({ json: { map } }));
  await page.goto(`http://127.0.0.1:3000/?community=${map.id}`);
  await expect(page.getByRole('heading', { name: map.title, exact: true })).toBeVisible();
  const failed = page.waitForResponse((response) => response.url().endsWith('/api/puzzles/today'));
  failDaily();
  await (await failed).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole('heading', { name: map.title, exact: true })).toBeVisible();
  await expect(
    page.getByText('Today’s puzzle service is unavailable.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('a creator solves and publishes a map; another browser discovers, shares and plays it', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  test.skip(
    !process.env.TEST_DATABASE_URL,
    'Requires the migrated local acceptance database; no API responses are mocked.',
  );
  const author = await browser.newContext();
  const reader = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  try {
    for (const context of [author, reader])
      await context.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
    const page = await author.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('http://127.0.0.1:3000/');
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    const editor = page.getByRole('region', { name: 'Level editor', exact: true });
    const { document } = communityPublishingFixture();
    await editor.locator('input[type=file]').setInputFiles({
      name: 'community-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
      document.editor.name,
    );
    await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toBeDisabled();
    await editor.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(editor.getByText('Goal reached', { exact: false }).first()).toBeVisible();
    await editor.getByLabel('Map title', { exact: true }).fill('A published browser course');
    await editor
      .getByLabel('Description (optional)', { exact: true })
      .fill('Created, solved and verified through the real API.');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await mkdir('artifacts/community-publishing', { recursive: true });
    await page.screenshot({
      path: 'artifacts/community-publishing/publish-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1500, height: 1050 });
    let committedMapId = '',
      originalRequestId = '';
    await page.route(
      '**/api/community',
      async (route) => {
        originalRequestId = route.request().postDataJSON().requestId;
        const committed = await route.fetch();
        expect(committed.status(), await committed.text()).toBe(201);
        committedMapId = (await committed.json()).map.id;
        await route.fulfill({
          status: 503,
          json: { error: 'Publication response lost. Please retry.' },
        });
      },
      { times: 1 },
    );
    await editor.getByRole('button', { name: 'Publish map', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('Publication response lost');
    await editor.getByRole('button', { name: 'Return to editor', exact: true }).click();
    await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
    await expect(editor.getByLabel('Map title', { exact: true })).toHaveValue(
      'A published browser course',
    );
    await editor.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toBeEnabled();
    const posted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/community') && response.request().method() === 'POST',
    );
    await editor.getByRole('button', { name: 'Publish map', exact: true }).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON().requestId).toBe(originalRequestId);
    const { map } = await response.json();
    expect(map.id).toBe(committedMapId);
    const link = editor.getByRole('link', { name: `Play and share ${map.title}` });
    await expect(link).toBeVisible();
    await mkdir('artifacts/community-publishing', { recursive: true });
    await page.screenshot({
      path: 'artifacts/community-publishing/published-desktop.png',
      fullPage: true,
    });
    const visitor = await reader.newPage();
    visitor.on('pageerror', (error) => errors.push(error.message));
    let rankedStarts = 0;
    visitor.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/runs')) rankedStarts++;
    });
    await visitor.goto(`http://127.0.0.1:3000${await link.getAttribute('href')}`);
    await expect(visitor.getByRole('heading', { name: map.title, exact: true })).toBeVisible();
    await expect(visitor.locator('.challenge-label')).toContainText('Community map');
    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: map.title, exact: true })).toBeVisible();
    await visitor.getByRole('button', { name: 'Community', exact: true }).click();
    const card = visitor.getByRole('article').filter({
      has: visitor.locator(`a[href="/?community=${map.id}"]`),
    });
    await expect(card.getByRole('link', { name: map.title, exact: true })).toBeVisible();
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await visitor.screenshot({
      path: 'artifacts/community-publishing/community-mobile.png',
      fullPage: true,
    });
    await card.getByRole('button', { name: `Play ${map.title}`, exact: true }).click();
    await visitor.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(visitor.getByRole('dialog', { name: 'Nice work!', exact: true })).toBeVisible();
    await visitor.getByRole('button', { name: 'Copy result', exact: true }).click();
    // Clipboard availability varies by environment; the selectable result is always shown.
    await expect(visitor.getByLabel('Result text')).toHaveValue(/Community — unranked/);
    await expect(visitor.getByLabel('Result text')).toHaveValue(new RegExp(map.id));
    expect(rankedStarts).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await author.close();
    await reader.close();
  }
});
