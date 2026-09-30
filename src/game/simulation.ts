import RAPIER from '@dimforge/rapier2d-compat';
import { compareCommands, dequantizePosition, validateCommand } from './commands';
import { FIXED_DT, SIMULATION_VERSION } from './constants';
import { transformPolygon, triangulateSimplePolygon } from './geometry/polygon';
import { GEOMETRY_EPSILON } from './geometry/vector';
import { sortById } from './ids';
import type { FieldZoneDefinition, Level } from './levels/types';
import { validateLevel } from './levels/validate';
import { buildPhysicsWorld, resolvePieces, staticRenderBodies } from './objects/bodies';
import type { ResolvedPiece } from './objects/bodies';
import { calculateFieldLoad, fieldWorldPolygon, prepareField } from './objects/fields';
import type { PreparedField } from './objects/fields';
import { predictFromSimulation } from './prediction';
import { assertCompatibleSnapshot, copyFieldState } from './snapshot';
import type { MutableFieldState } from './snapshot';
import type {
  Game,
  GameCommand,
  GameEvent,
  GameSnapshot,
  Prediction,
  PredictionOptions,
  RenderField,
  RenderState,
  RenderStaticBody,
  Vec2,
} from './types';

type DynamicBody = Readonly<{ id: string; pieces: readonly ResolvedPiece[] }>;
type Field = Readonly<{ definition: FieldZoneDefinition; localTriangles: readonly Vec2[][] }>;

export class Simulation implements Game {
  readonly level: Level;
  // Level data, sorted by ID once so every tick iterates in the same order.
  private readonly dynamicBodies: readonly DynamicBody[];
  private readonly staticBodies: readonly RenderStaticBody[];
  private readonly fields: readonly Field[];

  private world!: RAPIER.World;
  private bodyHandles: Record<string, number> = {};
  private fieldStates = new Map<string, MutableFieldState>();
  private queuedCommands: GameCommand[] = [];
  private sleepingByBody: Record<string, boolean> = {};
  private tick = 0;
  private events: GameEvent[] = [];
  private destroyed = false;

  // Derived from field state; cleared whenever a field moves or toggles.
  private preparedFields: readonly PreparedField[] | undefined;
  private renderFields: readonly RenderField[] | undefined;
  private renderState!: RenderState;

  constructor(level: Level, snapshot?: GameSnapshot) {
    validateLevel(level);
    this.level = level;
    this.dynamicBodies = sortById(level.dynamicBodies).map((body) => ({
      id: body.id,
      pieces: resolvePieces(body),
    }));
    this.staticBodies = staticRenderBodies(level);
    this.fields = sortById(level.fields).map((definition) => ({
      definition,
      localTriangles: triangulateSimplePolygon(definition.localPolygon),
    }));

    if (snapshot !== undefined) {
      this.load(snapshot);
      return;
    }
    const built = buildPhysicsWorld(level, FIXED_DT);
    this.world = built.world;
    this.bodyHandles = { ...built.bodyHandles };
    this.fieldStates = new Map(this.fields.map(({ definition }) =>
      [definition.id, copyFieldState(definition)]));
    for (const body of this.dynamicBodies) {
      this.sleepingByBody[body.id] = this.rigidBody(body.id).isSleeping();
    }
    this.renderState = this.buildRenderState();
  }

  queueCommand(command: GameCommand): void {
    this.assertAlive();
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
    this.assertAlive();
    this.applyQueuedCommands();
    this.applyFieldLoads();
    this.world.step();
    this.tick += 1;
    this.recordSleepChanges();
    this.renderState = this.buildRenderState();
  }

  getRenderState(): RenderState {
    this.assertAlive();
    return this.renderState;
  }

  snapshot(): GameSnapshot {
    this.assertAlive();
    return {
      levelId: this.level.id,
      levelVersion: this.level.version,
      simulationVersion: SIMULATION_VERSION,
      tick: this.tick,
      physics: new Uint8Array(this.world.takeSnapshot()),
      bodyHandles: { ...this.bodyHandles },
      fields: [...this.fieldStates.values()].map(copyFieldState),
      queuedCommands: [...this.queuedCommands].sort(compareCommands).map((command) => ({ ...command })),
      sleepingByBody: { ...this.sleepingByBody },
    };
  }

  restore(snapshot: GameSnapshot): void {
    this.assertAlive();
    this.load(snapshot);
  }

  predict(commands: GameCommand | readonly GameCommand[], options?: PredictionOptions): Prediction {
    this.assertAlive();
    return predictFromSimulation(this, commands, options);
  }

  cloneFromSnapshot(snapshot = this.snapshot()): Simulation {
    this.assertAlive();
    return new Simulation(this.level, snapshot);
  }

  allDynamicBodiesSleeping(): boolean {
    this.assertAlive();
    return this.dynamicBodies.every((body) => this.rigidBody(body.id).isSleeping());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.world.free();
    this.destroyed = true;
  }

  /** Replaces all mutable state. Leaves the current state untouched if the snapshot is invalid. */
  private load(snapshot: GameSnapshot): void {
    assertCompatibleSnapshot(snapshot, this.level);
    const world = RAPIER.World.restoreSnapshot(new Uint8Array(snapshot.physics));
    world.timestep = FIXED_DT;
    for (const body of this.dynamicBodies) {
      const handle = snapshot.bodyHandles[body.id];
      if (handle === undefined || !Number.isSafeInteger(handle) || handle < 0 ||
        world.getRigidBody(handle) === null) {
        world.free();
        throw new Error(`snapshot is missing body ${body.id}`);
      }
    }

    const fieldsById = new Map(snapshot.fields.map((field) => [field.id, field]));
    this.world?.free();
    this.world = world;
    this.bodyHandles = { ...snapshot.bodyHandles };
    this.fieldStates = new Map(this.fields.map(({ definition }) =>
      [definition.id, copyFieldState(fieldsById.get(definition.id)!)]));
    this.queuedCommands = snapshot.queuedCommands.map((command) => ({ ...command }));
    this.sleepingByBody = { ...snapshot.sleepingByBody };
    this.tick = snapshot.tick;
    this.events = [];
    this.invalidateFields();
    this.renderState = this.buildRenderState();
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
      .map(({ definition, localTriangles }) =>
        prepareField(definition, this.fieldState(definition.id), localTriangles));

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
      if (Math.abs(load.force.x) > GEOMETRY_EPSILON || Math.abs(load.force.y) > GEOMETRY_EPSILON ||
        Math.abs(load.torque) > GEOMETRY_EPSILON) {
        rigidBody.addForce(load.force, true);
        rigidBody.addTorque(load.torque, true);
      }
    }
  }

  private recordSleepChanges(): void {
    this.events = [];
    for (const body of this.dynamicBodies) {
      const sleeping = this.rigidBody(body.id).isSleeping();
      if (sleeping !== (this.sleepingByBody[body.id] ?? false)) {
        this.events.push({ type: sleeping ? 'body-slept' : 'body-woke', tick: this.tick, bodyId: body.id });
      }
      this.sleepingByBody[body.id] = sleeping;
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
        pieces: body.pieces.map((piece) => ({
          id: piece.id,
          worldPolygon: transformPolygon(piece.localPolygon, position, angle),
        })),
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
        force: { kind: definition.force.kind, params: definition.force.params },
      };
    });

    return {
      tick: this.tick,
      bodies,
      staticBodies: this.staticBodies,
      fields,
      events: this.events.map((event) => ({ ...event })),
    };
  }

  private invalidateFields(): void {
    this.preparedFields = undefined;
    this.renderFields = undefined;
  }

  private rigidBody(id: string): RAPIER.RigidBody {
    const handle = this.bodyHandles[id];
    if (handle === undefined) throw new Error(`missing Rapier handle for body ${id}`);
    return this.world.getRigidBody(handle);
  }

  private fieldState(id: string): MutableFieldState {
    const field = this.fieldStates.get(id);
    if (field === undefined) throw new Error(`missing state for field ${id}`);
    return field;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('game has been destroyed');
  }
}

let rapierInitialization: Promise<void> | undefined;

export async function createGame(level: Level): Promise<Game> {
  rapierInitialization ??= RAPIER.init();
  await rapierInitialization;
  return new Simulation(level);
}
