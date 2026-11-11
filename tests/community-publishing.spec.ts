import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { communityPublishingFixture } from './community-publishing-fixtures';
import { defaultRules } from '../src/game/run-evaluation';
import type { PublishCommunityMap } from '../src/shared/community-maps';

for (const reopen of [
  'close',
  'reload',
  'edit',
  'guest-change',
  'guest-expiry',
  'malformed-response',
] as const) {
  test(`publication retries preserve a nondefault proof after ${reopen}`, async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }),
    );
    let activeGuest: string | null = 'retry-author';
    let guestCreations = 0;
    await page.route('**/api/me', (route) =>
      activeGuest
        ? route.fulfill({ json: { player: { id: activeGuest, nickname: 'Retry author' } } })
        : route.fulfill({ status: 401, json: { error: 'Guest expired', code: 'GUEST_REQUIRED' } }),
    );
    await page.route('**/api/guest', (route) => {
      guestCreations++;
      activeGuest = 'replacement-author';
      return route.fulfill({ json: { player: { id: activeGuest, nickname: 'Retry author' } } });
    });
    const submissions: PublishCommunityMap[] = [];
    await page.route('**/api/community', async (route) => {
      const submission = route.request().postDataJSON() as PublishCommunityMap;
      submissions.push(submission);
      const journal = await page.evaluate(
        (id) =>
          JSON.parse(
            sessionStorage.getItem(`puttential-community-publish-v1/${encodeURIComponent(id)}`)!,
          ),
        submission.document.level.id,
      );
      expect(journal.guestId).toBe(submission.expectedGuestId);
      expect(journal.requestId).toBe(submission.requestId);
      if (!activeGuest)
        return route.fulfill({
          status: 401,
          json: { error: 'Guest expired', code: 'GUEST_REQUIRED' },
        });
      if (submission.expectedGuestId !== activeGuest)
        return route.fulfill({
          status: 409,
          json: { error: 'Guest changed', code: 'GUEST_CHANGED' },
        });
      if (submissions.length === 1 && reopen === 'malformed-response')
        return route.fulfill({ status: 201, json: { map: { id: 'invalid-map-id' } } });
      return submissions.length === 1
        ? route.fulfill({ status: 503, json: { error: 'Publication response lost' } })
        : route.fulfill({
            status: 201,
            json: {
              map: {
                id: '00000000-0000-4000-8000-000000000001',
                title: submission.title,
                description: submission.description,
                creatorName: 'Retry author',
                createdAt: '2026-11-10T00:00:00.000Z',
              },
            },
          });
    });
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('http://127.0.0.1:3000/');
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    const editor = page.getByRole('region', { name: 'Level editor', exact: true });
    const { document } = communityPublishingFixture();
    await editor.locator('input[type=file]').setInputFiles({
      name: 'retry-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(
      document.editor.name,
    );
    await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await editor.locator('.tile-option').first().click();
    await editor.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toBeEnabled();
    await editor.getByLabel('Map title').fill('Recover this publication');
    await editor.getByRole('button', { name: 'Publish map', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText(
      reopen === 'malformed-response'
        ? 'Community returned invalid data'
        : 'Publication response lost',
    );
    if (reopen === 'close') {
      await mkdir('artifacts/community-followup', { recursive: true });
      await page.screenshot({
        path: 'artifacts/community-followup/publication-response-lost.png',
        fullPage: true,
      });
    }
    expect(
      submissions[0]!.placement.commands.some(
        (command) => command.type === 'set-field-enabled' && command.enabled,
      ),
    ).toBe(true);
    if (reopen === 'guest-change' || reopen === 'guest-expiry') {
      activeGuest = reopen === 'guest-change' ? 'another-author' : null;
      await context.clearCookies();
    }
    if (reopen === 'reload') {
      await page.reload();
      await page.getByRole('button', { name: 'Editor', exact: true }).click();
      await editor.getByRole('button', { name: 'Restore draft', exact: true }).click();
    } else {
      await editor.getByRole('button', { name: 'Return to editor', exact: true }).click();
    }
    await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(editor.locator('.tile-option').first()).toHaveAttribute('aria-pressed', 'false');
    if (reopen === 'guest-change' || reopen === 'guest-expiry') {
      await editor.getByRole('button', { name: 'Retry publication', exact: true }).click();
      await expect(editor.getByRole('alert')).toContainText(
        'guest session used for this publication has expired or changed',
      );
      expect(submissions).toHaveLength(2);
      expect(submissions[1]).toEqual(submissions[0]);
      expect(guestCreations).toBe(0);
      const journal = await page.evaluate(
        (id) =>
          JSON.parse(
            sessionStorage.getItem(`puttential-community-publish-v1/${encodeURIComponent(id)}`)!,
          ),
        document.level.id,
      );
      expect(journal.guestId).toBe('retry-author');
      activeGuest = 'retry-author';
      await editor.getByRole('button', { name: 'Retry publication', exact: true }).click();
      await expect(
        editor.getByRole('link', { name: 'Play and share Recover this publication' }),
      ).toBeVisible();
      expect(submissions[2]).toEqual(submissions[0]);
      return;
    }
    if (reopen === 'edit') {
      await editor.getByRole('button', { name: 'Edit publication', exact: true }).click();
      await editor.getByLabel('Map title').fill('A different publication');
      await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toBeDisabled();
      await editor.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toBeEnabled();
      await editor.getByRole('button', { name: 'Publish map', exact: true }).click();
      await expect(
        editor.getByRole('link', { name: 'Play and share A different publication' }),
      ).toBeVisible();
      expect(submissions[1]!.requestId).not.toBe(submissions[0]!.requestId);
      expect(submissions[1]!.title).toBe('A different publication');
      expect(submissions[1]!.placement.commands).not.toEqual(submissions[0]!.placement.commands);
      return;
    }
    if (reopen === 'close') {
      // A different successful playtest must not silently replace the pending proof.
      await editor.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(editor.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    }
    await expect(editor.getByLabel('Map title')).toBeDisabled();
    if (reopen === 'close') {
      await page.screenshot({
        path: 'artifacts/community-followup/publication-retry-restored.png',
        fullPage: true,
      });
    }
    await editor.getByRole('button', { name: 'Retry publication', exact: true }).click();
    await expect(
      editor.getByRole('link', { name: 'Play and share Recover this publication' }),
    ).toBeVisible();
    expect(submissions[1]).toEqual(submissions[0]);
  });
}

test('playtest accepts edge tiles and outside geometry while other moving bodies keep simulating', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('puttential-tutorial-v1', 'seen'));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }),
  );
  page.on('dialog', (dialog) => dialog.accept());
  const { document } = communityPublishingFixture();
  document.level.fields = [
    ...document.level.fields,
    {
      id: 'edge-tile',
      position: { x: 6.4, y: 0 },
      angle: 0,
      enabled: false,
      shape: { kind: 'rectangle', width: 2, height: 2 },
      force: { kind: 'uniform', density: { x: 1, y: 0 } },
    },
  ];
  document.level.dynamicBodies = [
    ...document.level.dynamicBodies,
    {
      ...document.level.dynamicBodies[0]!,
      id: 'outside-body',
      position: { x: 20, y: 0 },
      linearVelocity: { x: 1, y: 0 },
    },
  ];
  document.level.staticBodies = [
    ...document.level.staticBodies,
    { ...document.level.staticBodies[0]!, id: 'outside-obstacle', position: { x: 30, y: 0 } },
  ];
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Level editor', exact: true });
  await editor.locator('input[type=file]').setInputFiles({
    name: 'outside-map.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(editor.getByLabel('Course name', { exact: true })).toHaveValue(document.editor.name);
  await editor.getByRole('button', { name: 'Playtest', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Publish map', exact: true })).toBeEnabled();
  await expect(editor.getByRole('alert')).toHaveCount(0);
});

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
    await editor.locator('.tile-option').first().click();
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
    await expect(
      editor.getByRole('button', { name: 'Retry publication', exact: true }),
    ).toBeEnabled();
    await expect(editor.locator('.tile-option').first()).toHaveAttribute('aria-pressed', 'false');
    const posted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/community') && response.request().method() === 'POST',
    );
    await editor.getByRole('button', { name: 'Retry publication', exact: true }).click();
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
