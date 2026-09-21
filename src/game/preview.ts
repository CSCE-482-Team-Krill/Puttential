import type { Simulation } from './simulation';
import type {
  GameCommand,
  GameEvent,
  GameSnapshot,
  Prediction,
  PredictionSample,
  RenderState,
} from './types';

function sample(state: RenderState): PredictionSample {
  return {
    tick: state.tick,
    bodies: state.bodies.map((body) => ({
      id: body.id,
      position: { ...body.position },
      angle: body.angle,
    })),
  };
}

export function predictFromSimulation(simulation: Simulation, command: GameCommand): Prediction {
  const prediction = simulation.cloneFromSnapshot();
  const maxTicks = simulation.level.prediction?.maxTicks ?? 1200;
  const sampleEveryTicks = simulation.level.prediction?.sampleEveryTicks ?? 8;
  const samples: PredictionSample[] = [sample(prediction.getRenderState())];
  const events: GameEvent[] = [];
  let ticksSimulated = 0;
  let settled = false;

  try {
    prediction.queueCommand(command);
    while (ticksSimulated < maxTicks) {
      prediction.step();
      ticksSimulated += 1;
      events.push(...prediction.getRenderState().events);
      if (ticksSimulated % sampleEveryTicks === 0) {
        samples.push(sample(prediction.getRenderState()));
      }
      if (prediction.allDynamicBodiesSleeping()) {
        settled = true;
        break;
      }
    }

    const finalState = prediction.getRenderState();
    if (samples[samples.length - 1]?.tick !== finalState.tick) samples.push(sample(finalState));
    const finalSnapshot = prediction.snapshot();
    return {
      ticksSimulated,
      settled,
      samples,
      events: events.map((event) => ({ ...event })),
      finalState,
      finalSnapshot,
    };
  } finally {
    prediction.destroy();
  }
}

function stableSnapshotMetadata(snapshot: GameSnapshot): string {
  const handles = Object.entries(snapshot.bodyHandles).sort(([a], [b]) => a.localeCompare(b));
  const sleeping = Object.entries(snapshot.sleepingByBody).sort(([a], [b]) => a.localeCompare(b));
  const rules = Object.entries(snapshot.ruleState).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({
    levelId: snapshot.levelId,
    levelVersion: snapshot.levelVersion,
    simulationVersion: snapshot.simulationVersion,
    tick: snapshot.tick,
    handles,
    fields: [...snapshot.fields].sort((a, b) => a.id.localeCompare(b.id)),
    queuedCommands: [...snapshot.queuedCommands].sort((a, b) => a.sequence - b.sequence),
    sleeping,
    rules,
  });
}

/** Stable within the supported same-runtime determinism scope. */
export function hashSnapshot(snapshot: GameSnapshot): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const update = (byte: number): void => {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  };
  for (const byte of snapshot.physics) update(byte);
  for (const byte of new TextEncoder().encode(stableSnapshotMetadata(snapshot))) update(byte);
  return hash.toString(16).padStart(16, '0');
}
