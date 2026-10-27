import { parseLevel } from '../game';
import { defaultRules, makePlacement } from '../game/run-evaluation';
import type { Level } from '../game';

/** Small authored opening set. Publishing replays two distinct solutions before inserting a date. */
export function openingCourse(index: number) {
  const direction = ((index % 4) + 4) % 4;
  const angle = (direction * Math.PI) / 2,
    axis = { x: Math.round(Math.cos(angle)), y: Math.round(Math.sin(angle)) };
  const vertical = direction % 2 === 1;
  const start = { x: axis.x * -4.5, y: axis.y * -4.5 };
  const wall = (id: string, x: number, y: number, width: number, height: number) => ({
    id,
    position: { x, y },
    angle: 0,
    material: { restitution: 0.15 },
    pieces: [{ id: `${id}-piece`, shape: { kind: 'rectangle', width, height } }],
  });
  const names = [
    'First Fairway',
    'Garden Gate',
    'Westward Green',
    'South Lawn',
    'Clubhouse Approach',
    'North Terrace',
    'Return Fairway',
    'Lower Garden',
    'Open Courtyard',
    'Final Approach',
  ];
  const level: Level = parseLevel({
    formatVersion: 1,
    id: `daily-opening-${index + 1}`,
    version: 1,
    gravity: { x: 0, y: 0 },
    dynamicBodies: [
      {
        id: 'ball',
        position: start,
        angle: 0,
        density: 1,
        material: { restitution: 0.15 },
        ccd: true,
        pieces: [{ id: 'ball-piece', shape: { kind: 'circle', radius: 0.4 } }],
      },
    ],
    staticBodies: [
      wall('left-boundary', -7, 0, 0.5, 14.5),
      wall('right-boundary', 7, 0, 0.5, 14.5),
      wall('bottom-boundary', 0, -7, 14.5, 0.5),
      wall('top-boundary', 0, 7, 14.5, 0.5),
      ...(vertical
        ? [wall('garden-left', -2.5, 0, 1, 3), wall('garden-right', 2.5, 1, 1, 3)]
        : [wall('garden-top', 0, 2.5, 3, 1), wall('garden-bottom', 1, -2.5, 3, 1)]),
    ],
    fields: [1, 4].map((cost, i) => ({
      id: i ? 'strong-push' : 'gentle-push',
      shape: { kind: 'rectangle', width: 2.4, height: 1.6 },
      position: start,
      angle,
      enabled: false,
      force: { kind: 'uniform', density: { x: cost === 1 ? 2 : 5, y: 0 } },
    })),
    goal: {
      bodyId: 'ball',
      minX: vertical ? -1.8 : axis.x > 0 ? 3.8 : -6.6,
      maxX: vertical ? 1.8 : axis.x > 0 ? 6.6 : -3.8,
      minY: !vertical ? -1.8 : axis.y > 0 ? 3.8 : -6.6,
      maxY: !vertical ? 1.8 : axis.y > 0 ? 6.6 : -3.8,
      holdSeconds: 0.5,
    },
    prediction: { maxTicks: 60, sampleEveryTicks: 1 },
  });
  const rules = { ...defaultRules(level), tileCosts: { 'gentle-push': 1, 'strong-push': 4 } };
  const solution = (offset: number) =>
    makePlacement(
      level,
      Object.fromEntries(
        level.fields.map((f) => [
          f.id,
          {
            position: { x: f.position.x + axis.x * offset, y: f.position.y + axis.y * offset },
            angle: f.angle,
            enabled: f.id === 'gentle-push',
          },
        ]),
      ),
      rules,
    );
  return {
    level,
    rules,
    title: names[((index % names.length) + names.length) % names.length]!,
    solutions: [solution(0), solution(0.4)],
  };
}
