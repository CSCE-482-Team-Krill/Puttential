import { test, expect } from '@playwright/test';
import { freshDocument } from '../level-editor/editor/model';
import { parseLevel } from '../src/game';

for (const frameMs of [8, 67]) {
  for (const hazardFirst of [false, true]) {
    test(`${hazardFirst ? 'lava before goal' : 'goal before lava'} stops at the same tick with ${frameMs}ms frames`, async ({
      page,
    }) => {
      await page.addInitScript((interval) => {
        window.requestAnimationFrame = (callback) =>
          window.setTimeout(() => callback(performance.now()), interval);
        window.cancelAnimationFrame = (id) => window.clearTimeout(id);
      }, frameMs);
      const base = freshDocument().level;
      const level = parseLevel({
        ...base,
        id: 'run-timing-check',
        staticBodies: [],
        dynamicBodies: [
          { ...base.dynamicBodies[0], position: { x: 0, y: 0 }, linearVelocity: { x: 4, y: 0 } },
        ],
        goal: { ...base.goal, minX: 0.04, maxX: 4.3, holdSeconds: hazardFirst ? 1.1 : 1 },
        fields: [
          {
            id: 'lava',
            position: { x: 5.55, y: 0 },
            angle: 0,
            enabled: true,
            shape: { kind: 'rectangle', width: 2, height: 2 },
            force: { kind: 'lava' },
          },
        ],
      });
      const attempts: Record<string, unknown>[] = [];
      let solutions = 0;
      await page.route('**/api/puzzles/today', (route) =>
        route.fulfill({
          json: {
            id: 'timing-puzzle',
            date: '2026-10-19',
            seed: 'timing',
            difficulty: 1,
            configuration: level,
          },
        }),
      );
      await page.route('**/api/attempts', async (route) => {
        attempts.push(route.request().postDataJSON());
        await route.fulfill({ status: 201, json: { attemptId: 'timing-attempt' } });
      });
      await page.route('**/api/solutions', async (route) => {
        solutions++;
        await route.fulfill({ status: 201, json: { solutionId: 'timing-solution' } });
      });
      await page.goto('http://127.0.0.1:3000');
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: hazardFirst ? 'So close' : 'Nice work!' }),
      ).toBeVisible();
      await expect(
        page.getByText(hazardFirst ? 'Attempt saved.' : 'Attempt and solution saved.', {
          exact: true,
        }),
      ).toBeVisible();
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        success: !hazardFirst,
        simulationTime: (hazardFirst ? 125 : 121) / 120,
        tileCount: 0,
      });
      expect(solutions).toBe(hazardFirst ? 0 : 1);
      // A completed run stays frozen even after later animation frames.
      await page.clock.install();
      await page.clock.runFor(500);
      expect(attempts).toHaveLength(1);
      expect(solutions).toBe(hazardFirst ? 0 : 1);
    });
  }
}
