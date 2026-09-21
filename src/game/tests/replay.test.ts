import { afterEach, describe, expect, it } from 'vitest';
import { quantizePosition } from '../commands';
import { rectangle } from '../geometry/polygon';
import type { Level } from '../levels/types';
import { hashSnapshot } from '../preview';
import { createGame } from '../simulation';
import type { Game, GameCommand, GameSnapshot } from '../types';

const level: Level = {
  id: 'determinism-test',
  version: 1,
  gravity: { x: 0, y: 0 },
  dynamicBodies: [
    {
      id: 'bar',
      position: { x: 0, y: 0 },
      angle: 0,
      density: 1,
      material: { restitution: 0.1 },
      ccd: true,
      pieces: [{ id: 'bar-piece', localPolygon: rectangle(3, 0.5) }],
    },
  ],
  staticBodies: [],
  fields: [
    {
      id: 'push',
      localPolygon: rectangle(1.5, 1.5),
      position: { x: 0.75, y: 0 },
      angle: 0,
      forceDensityLocal: { x: 0, y: 5 },
      enabled: false,
    },
  ],
  prediction: { maxTicks: 40, sampleEveryTicks: 5 },
};

const games: Game[] = [];

afterEach(() => {
  for (const game of games.splice(0)) game.destroy();
});

async function game(): Promise<Game> {
  const result = await createGame(level);
  games.push(result);
  return result;
}

const commandLog: ReadonlyMap<number, readonly GameCommand[]> = new Map([
  [
    0,
    [{ type: 'set-field-enabled', fieldId: 'push', enabled: true, sequence: 1 }],
  ],
  [
    12,
    [
      {
        type: 'move-field',
        fieldId: 'push',
        xQ: quantizePosition(-0.75),
        yQ: quantizePosition(0.1),
        sequence: 2,
      },
    ],
  ],
  [
    24,
    [{ type: 'set-field-enabled', fieldId: 'push', enabled: false, sequence: 3 }],
  ],
]);

function replay(target: Game, start: GameSnapshot, ticks: number): Map<number, string> {
  target.restore(start);
  const hashes = new Map<number, string>();
  for (let index = 0; index < ticks; index += 1) {
    for (const command of commandLog.get(index) ?? []) target.queueCommand(command);
    target.step();
    if ([1, 12, 13, 25, ticks].includes(index + 1)) {
      hashes.set(index + 1, hashSnapshot(target.snapshot()));
    }
  }
  return hashes;
}

describe('snapshots, replay, and prediction', () => {
  it('replays the same command log to identical named-tick hashes', async () => {
    const target = await game();
    const initial = target.snapshot();
    const first = replay(target, initial, 80);
    const second = replay(target, initial, 80);
    expect(second).toEqual(first);
  });

  it('restores queued commands as part of the snapshot', async () => {
    const target = await game();
    target.queueCommand({
      type: 'set-field-enabled',
      fieldId: 'push',
      enabled: true,
      sequence: 7,
    });
    const withQueue = target.snapshot();
    target.step();
    target.restore(withQueue);
    expect(target.snapshot().queuedCommands).toEqual(withQueue.queuedCommands);
  });

  it('rejects snapshots that alter a field fixed angle', async () => {
    const target = await game();
    const snapshot = target.snapshot();
    expect(() =>
      target.restore({
        ...snapshot,
        fields: snapshot.fields.map((field) => ({ ...field, angle: field.angle + 0.1 })),
      }),
    ).toThrow(/fixed angle/);
  });

  it('predicts with an isolated real simulation and matches live execution', async () => {
    const target = await game();
    const command: GameCommand = {
      type: 'set-field-enabled',
      fieldId: 'push',
      enabled: true,
      sequence: 1,
    };
    const beforePrediction = hashSnapshot(target.snapshot());
    const prediction = target.predict(command);
    expect(hashSnapshot(target.snapshot())).toBe(beforePrediction);

    target.queueCommand(command);
    for (let tick = 0; tick < prediction.ticksSimulated; tick += 1) target.step();
    expect(hashSnapshot(target.snapshot())).toBe(hashSnapshot(prediction.finalSnapshot));
    expect(target.getRenderState()).toEqual(prediction.finalState);
  });

  it('accepts caller-specific prediction length and sampling', async () => {
    const target = await game();
    const prediction = target.predict(
      {
        type: 'set-field-enabled',
        fieldId: 'push',
        enabled: true,
        sequence: 1,
      },
      { maxTicks: 6, sampleEveryTicks: 2 },
    );
    expect(prediction.ticksSimulated).toBe(6);
    expect(prediction.samples.map((sample) => sample.tick)).toEqual([0, 2, 4, 6]);
  });
});
