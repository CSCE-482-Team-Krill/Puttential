import type { Level } from '../src/game';
import { starterLevels } from '../src/game/levels/starters';

// Data-only fixtures. They go through the same HTTP decoder as a real daily course.
export function inventoryLevel(
  count: number,
  options: { enabled?: boolean; long?: boolean } = {},
): Level {
  return {
    ...starterLevels[0]!,
    id: 'ui-polish-course',
    prediction: { maxTicks: 120, sampleEveryTicks: 4 },
    fields: Array.from({ length: count }, (_, index) => ({
      id:
        options.long && index === 0
          ? 'a-carefully-positioned-force-block-with-a-very-long-readable-name-field'
          : count === 1
            ? 'putting-field'
            : `putting-${index + 1}-field`,
      shape: { kind: 'rectangle' as const, width: 1.5, height: 1.2 },
      position: { x: -3 + (index % 4) * 2, y: -Math.floor(index / 4) * 1.3 },
      angle: 0,
      enabled: index === 0 && options.enabled === true,
      force:
        options.long && index === 0
          ? { kind: 'attractor' as const, source: { x: 0, y: 0 }, strength: 1 }
          : { kind: 'uniform' as const, density: { x: 1, y: 0 } },
    })),
  };
}

export const successLevel: Level = {
  ...starterLevels[0]!,
  id: 'ui-polish-success',
  goal: { bodyId: 'bar', minX: -6, maxX: -3, minY: 0, maxY: 3, holdSeconds: 0.025 },
};

export function dailyFixture(configuration: Level) {
  return {
    id: 'ui-polish-daily',
    date: '2026-10-15',
    seed: 'ui-polish-fixed',
    difficulty: 1,
    configuration,
  };
}
