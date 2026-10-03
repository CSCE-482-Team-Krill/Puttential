import RAPIER from '@dimforge/rapier2d-compat';
import { compareCommands, dequantizePosition, validateCommand } from './commands';
import { triangulateSimplePolygon } from './geometry/polygon';
import { shapePolygon } from './geometry/shapes';
import { GEOMETRY_EPSILON } from './geometry/vector';
import { sortById } from './ids';
import type { FieldZoneDefinition, Level } from './levels/types';
import { assertPositiveInteger, parseLevel } from './levels/parse';
import { buildPhysicsWorld, renderPiece, resolveBodyPieces, staticRenderBodies } from './objects/bodies';
import type { ResolvedPiece } from './objects/bodies';
import { calculateFieldLoad, fieldWorldPolygon, prepareField } from './objects/fields';
import type { PreparedField } from './objects/fields';
import { forceDensity } from './objects/forces';
import type { ForceDensity } from './objects/forces';
import type {
  FieldState,
  Game,
  GameCommand,
  GameSnapshot,
  Prediction,
  PredictionOptions,
  PredictionSample,
  RenderField,
  RenderState,
  RenderStaticBody,
  Vec2,
} from './types';

export const FIXED_DT = 1 / 120;

type DynamicBody = Readonly<{ id: string; pieces: readonly ResolvedPiece[] }>;
type Field = Readonly<{
  definition: FieldZoneDefinition;
  localTriangles: readonly Vec2[][];
  densityAt: ForceDensity;
}>;
type MutableFieldState = { id: string; position: { x: number; y: number }; angle: number; enabled: boolean };

function copyFieldState(field: FieldState): MutableFieldState {
  return {
    id: field.id,
    position: { x: field.position.x, y: field.position.y },
    angle: field.angle,
    enabled: field.enabled,
  };
}

function sample(state: RenderState): PredictionSample {
  return {
    tick: state.tick,
    bodies: state.bodies.map(({ id, position, angle }) => ({ id, position, angle })),
  };
}

class Simulation implements Game {
  private readonly level: Level;
  // Level data, sorted by ID once so every tick iterates in the same order.
  private readonly dynamicBodies: readonly DynamicBody[];
  private readonly staticBodies: readonly RenderStaticBody[];
  private readonly fields: readonly Field[];

  private world!: RAPIER.World;
  private bodyHandles: Record<string, number> = {};
  private fieldStates = new Map<string, MutableFieldState>();
  private queuedCommands: GameCommand[] = [];
  private tick = 0;
  private goalHeldTicks = 0;
  private goalCompletedTick: number | null = null;

  // Derived from field state; cleared whenever a field moves or toggles.
  private preparedFields: readonly PreparedField[] | undefined;
  private renderFields: readonly RenderField[] | undefined;
  private renderState!: RenderState;

  constructor(data: Level, snapshot?: GameSnapshot) {
    const level = parseLevel(data);
    this.level = level;
    this.dynamicBodies = sortById(level.dynamicBodies).map((body) => ({
      id: body.id,
      pieces: resolveBodyPieces(body),
    }));
    this.staticBodies = staticRenderBodies(level);
    this.fields = sortById(level.fields).map((definition) => ({
      definition,
      localTriangles: triangulateSimplePolygon(shapePolygon(definition.shape)),
      densityAt: forceDensity(definition.force),
    }));

    if (snapshot !== undefined) {
      this.restore(snapshot);
      return;
    }
    const built = buildPhysicsWorld(level, FIXED_DT);
    this.world = built.world;
    this.bodyHandles = { ...built.bodyHandles };
    this.fieldStates = new Map(this.fields.map(({ definition }) =>
      [definition.id, copyFieldState(definition)]));
    this.renderState = this.buildRenderState();
  }

  queueCommand(command: GameCommand): void {
    validateCommand(command);
    if (!this.fieldStates.has(command.fieldId)) {
      throw new Error(`unknown field ID: ${command.fieldId}`);
    }
    if (this.queuedCommands.some((queued) => queued.sequence === command.sequence)) {
      throw new Error(`duplicate queued command sequence: ${command.sequence}`);
    }
    this.queuedCommands.push({ ...command });
  }

  step(): void {
    this.applyQueuedCommands();
    this.applyFieldLoads();
    this.world.step();
    this.tick += 1;
    this.updateGoal();
    this.renderState = this.buildRenderState();
  }

  getRenderState(): RenderState {
    return this.renderState;
  }

  snapshot(): GameSnapshot {
    return {
      levelId: this.level.id,
      tick: this.tick,
      physics: this.world.takeSnapshot(),
      bodyHandles: { ...this.bodyHandles },
      fields: [...this.fieldStates.values()].map(copyFieldState),
      queuedCommands: [...this.queuedCommands].sort(compareCommands).map((command) => ({ ...command })),
      goal: { heldTicks: this.goalHeldTicks, completedTick: this.goalCompletedTick },
    };
  }

  restore(snapshot: GameSnapshot): void {
    if (snapshot.levelId !== this.level.id) {
      throw new Error('snapshot level ID does not match this game');
    }
    const world = RAPIER.World.restoreSnapshot(snapshot.physics);
    world.timestep = FIXED_DT;
    this.world?.free();
    this.world = world;
    this.bodyHandles = { ...snapshot.bodyHandles };
    this.fieldStates = new Map(snapshot.fields.map((field) => [field.id, copyFieldState(field)]));
    this.queuedCommands = snapshot.queuedCommands.map((command) => ({ ...command }));
    this.tick = snapshot.tick;
    this.goalHeldTicks = snapshot.goal.heldTicks;
    this.goalCompletedTick = snapshot.goal.completedTick;
    this.invalidateFields();
    this.renderState = this.buildRenderState();
  }

  /** Runs the commands on a copy of this game until the goal completes, every body sleeps, or the tick limit. */
  predict(commands: GameCommand | readonly GameCommand[], options: PredictionOptions): Prediction {
    const { maxTicks, sampleEveryTicks = 1 } = options;
    assertPositiveInteger(maxTicks, 'prediction maxTicks');
    assertPositiveInteger(sampleEveryTicks, 'prediction sampleEveryTicks');

    const copy = new Simulation(this.level, this.snapshot());
    try {
      for (const command of Array.isArray(commands) ? commands : [commands]) {
        copy.queueCommand(command);
      }
      const samples = [sample(copy.renderState)];
      let settled = false;
      const completed = (): boolean => copy.goalCompletedTick !== this.goalCompletedTick;
      while (!settled && !completed() && copy.tick - this.tick < maxTicks) {
        copy.step();
        // A body resting inside the goal still has to finish its hold.
        settled = copy.renderState.bodies.every((body) => body.sleeping) && !copy.renderState.goal.inside;
        if ((copy.tick - this.tick) % sampleEveryTicks === 0) {
          samples.push(sample(copy.renderState));
        }
      }
      if (samples[samples.length - 1]!.tick !== copy.tick) samples.push(sample(copy.renderState));
      return {
        ticksSimulated: copy.tick - this.tick,
        settled,
        samples,
        finalState: copy.renderState,
        finalSnapshot: copy.snapshot(),
      };
    } finally {
      copy.destroy();
    }
  }

  destroy(): void {
    this.world.free();
  }

  private applyQueuedCommands(): void {
    if (this.queuedCommands.length === 0) return;
    const commands = this.queuedCommands.sort(compareCommands);
    this.queuedCommands = [];
    for (const command of commands) {
      const field = this.fieldState(command.fieldId);
      if (command.type === 'move-field') {
        field.position.x = dequantizePosition(command.xQ);
        field.position.y = dequantizePosition(command.yQ);
      } else {
        field.enabled = command.enabled;
      }
    }
    this.invalidateFields();
  }

  private applyFieldLoads(): void {
    const fields = this.preparedFields ??= this.fields
      .filter(({ definition }) => this.fieldState(definition.id).enabled)
      .map(({ definition, localTriangles, densityAt }) =>
        prepareField(densityAt, this.fieldState(definition.id), localTriangles));

    for (const body of this.dynamicBodies) {
      const rigidBody = this.rigidBody(body.id);
      rigidBody.resetForces(false);
      rigidBody.resetTorques(false);
      if (fields.length === 0) continue;

      const load = calculateFieldLoad({
        position: rigidBody.translation(),
        angle: rigidBody.rotation(),
        centerOfMass: rigidBody.worldCom(),
        linearVelocity: rigidBody.linvel(),
        angularVelocity: rigidBody.angvel(),
        pieces: body.pieces,
      }, fields);
      if (!Number.isFinite(load.force.x) || !Number.isFinite(load.force.y) ||
        !Number.isFinite(load.torque)) {
        throw new Error(`field load on body ${body.id} is not finite`);
      }
      // Skip empty loads so fields do not wake sleeping bodies they do not touch.
      if (Math.abs(load.force.x) > GEOMETRY_EPSILON || Math.abs(load.force.y) > GEOMETRY_EPSILON ||
        Math.abs(load.torque) > GEOMETRY_EPSILON) {
        rigidBody.addForce(load.force, true);
        rigidBody.addTorque(load.torque, true);
      }
    }
  }

  private holdTicks(): number {
    return Math.max(1, Math.round(this.level.goal.holdSeconds / FIXED_DT));
  }

  private goalContainsBody(): boolean {
    const { area, bodyId } = this.level.goal;
    const { x, y } = this.rigidBody(bodyId).translation();
    return x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;
  }

  private updateGoal(): void {
    this.goalHeldTicks = this.goalContainsBody() ? this.goalHeldTicks + 1 : 0;
    if (this.goalCompletedTick === null && this.goalHeldTicks >= this.holdTicks()) {
      this.goalCompletedTick = this.tick;
    }
  }

  private buildRenderState(): RenderState {
    const bodies = this.dynamicBodies.map((body) => {
      const rigidBody = this.rigidBody(body.id);
      const translation = rigidBody.translation();
      const velocity = rigidBody.linvel();
      const position = { x: translation.x, y: translation.y };
      const angle = rigidBody.rotation();
      return {
        id: body.id,
        position,
        angle,
        linearVelocity: { x: velocity.x, y: velocity.y },
        angularVelocity: rigidBody.angvel(),
        sleeping: rigidBody.isSleeping(),
        pieces: body.pieces.map((piece) => renderPiece(piece, position, angle)),
      };
    });

    const fields = this.renderFields ??= this.fields.map(({ definition }) => {
      const state = this.fieldState(definition.id);
      return {
        id: definition.id,
        worldPolygon: fieldWorldPolygon(definition, state),
        position: { ...state.position },
        angle: state.angle,
        enabled: state.enabled,
        force: definition.force,
      };
    });

    return {
      tick: this.tick,
      bodies,
      staticBodies: this.staticBodies,
      fields,
      goal: {
        bodyId: this.level.goal.bodyId,
        area: this.level.goal.area,
        inside: this.goalContainsBody(),
        heldTicks: this.goalHeldTicks,
        holdTicks: this.holdTicks(),
        completedTick: this.goalCompletedTick,
      },
    };
  }

  private invalidateFields(): void {
    this.preparedFields = undefined;
    this.renderFields = undefined;
  }

  private rigidBody(id: string): RAPIER.RigidBody {
    return this.world.getRigidBody(this.bodyHandles[id]!);
  }

  private fieldState(id: string): MutableFieldState {
    const field = this.fieldStates.get(id);
    if (field === undefined) throw new Error(`missing state for field ${id}`);
    return field;
  }
}

let rapierInitialization: Promise<void> | undefined;

export async function createGame(level: Level): Promise<Game> {
  rapierInitialization ??= RAPIER.init();
  await rapierInitialization;
  return new Simulation(level);
}
