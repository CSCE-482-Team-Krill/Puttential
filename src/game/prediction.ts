import { assertPositiveInteger } from './levels/validate';
import type { Simulation } from './simulation';
import type {
  GameCommand,
  GameEvent,
  Prediction,
  PredictionOptions,
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

export function predictFromSimulation(
  simulation: Simulation,
  commands: GameCommand | readonly GameCommand[],
  options?: PredictionOptions,
): Prediction {
  const maxTicks = options?.maxTicks ?? simulation.level.prediction?.maxTicks ?? 1200;
  const sampleEveryTicks =
    options?.sampleEveryTicks ?? simulation.level.prediction?.sampleEveryTicks ?? 8;
  assertPositiveInteger(maxTicks, 'prediction maxTicks');
  assertPositiveInteger(sampleEveryTicks, 'prediction sampleEveryTicks');

  const prediction = simulation.cloneFromSnapshot();
  const samples: PredictionSample[] = [sample(prediction.getRenderState())];
  const events: GameEvent[] = [];
  let ticksSimulated = 0;
  let settled = false;

  try {
    for (const command of Array.isArray(commands) ? commands : [commands]) {
      prediction.queueCommand(command);
    }
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
    return {
      ticksSimulated,
      settled,
      samples,
      events,
      finalState,
      finalSnapshot: prediction.snapshot(),
    };
  } finally {
    prediction.destroy();
  }
}
