import RAPIER from '@dimforge/rapier2d-compat';
import {
  compareCommands,
  dequantizeAngle,
  dequantizePosition,
  validateCommand,
} from './commands';
import { GEOMETRY_EPSILON } from './geometry/mass';
import { rotateVector, transformPolygon } from './geometry/polygon';
import type { FieldZoneDefinition, Level } from './levels/types';
import { validateLevel } from './levels/validate';
import { buildPhysicsWorld, staticRenderBodies } from './objects/bodies';
import { calculateFieldLoad, fieldWorldPolygon } from './objects/fields';
import { predictFromSimulation } from './preview';
import type {
  FieldState,
  Game,
  GameCommand,
  GameEvent,
  GameSnapshot,
  Prediction,
  RenderState,
} from './types';

export const FIXED_DT = 1 / 120;
export const SIMULATION_VERSION = 'puttential-core-1|rapier-0.20.0|dt-1/120';

type MutableFieldState = {
  id: string;
  position: { x: number; y: number };
  angle: number;
  enabled: boolean;
};

function cloneCommand(command: GameCommand): GameCommand {
  return { ...command };
}

function copyFieldState(field: FieldState): FieldState {
  return {
    id: field.id,
    position: { x: field.position.x, y: field.position.y },
    angle: field.angle,
    enabled: field.enabled,
  };
}

export class Simulation implements Game {
  readonly level: Level;
  private world: RAPIER.World;
  private bodyHandles: Record<string, number>;
  private readonly dynamicBodies;
  private readonly fieldDefinitions;
  private readonly fieldDefinitionById: ReadonlyMap<string, FieldZoneDefinition>;
  private fields: MutableFieldState[];
  private readonly fieldById = new Map<string, MutableFieldState>();
  private queuedCommands: GameCommand[] = [];
  private sleepingByBody: Record<string, boolean> = {};
  private ruleState: Record<string, number | string | boolean | null> = {};
  private tick = 0;
  private events: GameEvent[] = [];
  private renderState: RenderState;
  private destroyed = false;

  constructor(level: Level, snapshot?: GameSnapshot) {
    validateLevel(level);
    this.level = level;
    this.dynamicBodies = [...level.dynamicBodies].sort((a, b) => a.id.localeCompare(b.id));
    this.fieldDefinitions = [...level.fields].sort((a, b) => a.id.localeCompare(b.id));
    this.fieldDefinitionById = new Map(this.fieldDefinitions.map((field) => [field.id, field]));

    if (snapshot === undefined) {
      const built = buildPhysicsWorld(level, FIXED_DT);
      this.world = built.world;
      this.bodyHandles = { ...built.bodyHandles };
      this.fields = this.fieldDefinitions.map((field) => ({
        id: field.id,
        position: { ...field.position },
        angle: field.angle,
        enabled: field.enabled,
      }));
      this.indexFields();
      for (const body of this.dynamicBodies) {
        this.sleepingByBody[body.id] = this.rigidBody(body.id).isSleeping();
      }
    } else {
      this.assertCompatibleSnapshot(snapshot);
      this.world = RAPIER.World.restoreSnapshot(new Uint8Array(snapshot.physics));
      this.world.timestep = FIXED_DT;
      this.bodyHandles = { ...snapshot.bodyHandles };
      this.fields = snapshot.fields.map((field) => ({
        id: field.id,
        position: { ...field.position },
        angle: field.angle,
        enabled: field.enabled,
      }));
      this.queuedCommands = snapshot.queuedCommands.map(cloneCommand);
      this.sleepingByBody = { ...snapshot.sleepingByBody };
      this.ruleState = { ...snapshot.ruleState };
      this.tick = snapshot.tick;
      this.indexFields();
      this.assertSnapshotContents();
    }
    this.renderState = this.buildRenderState();
  }

  queueCommand(command: GameCommand): void {
    this.assertAlive();
    validateCommand(command);
    if (!this.fieldById.has(command.fieldId)) {
      throw new Error(`unknown field ID: ${command.fieldId}`);
    }
    if (this.queuedCommands.some((queued) => queued.sequence === command.sequence)) {
      throw new Error(`duplicate queued command sequence: ${command.sequence}`);
    }
    this.queuedCommands.push(cloneCommand(command));
  }

  step(): void {
    this.assertAlive();
    this.applyQueuedCommands();
    this.events = [];

    for (const definition of this.dynamicBodies) {
      const body = this.rigidBody(definition.id);
      body.resetForces(false);
      body.resetTorques(false);
    }

    const fields = this.fieldDefinitions.map((definition) => ({
      definition,
      state: this.requiredField(definition.id),
    }));
    for (const definition of this.dynamicBodies) {
      const body = this.rigidBody(definition.id);
      const translation = body.translation();
      const centerOfMass = body.worldCom();
      const load = calculateFieldLoad(
        {
          position: { x: translation.x, y: translation.y },
          angle: body.rotation(),
          centerOfMass: { x: centerOfMass.x, y: centerOfMass.y },
          pieces: definition.pieces,
        },
        fields,
      );
      const active =
        Math.abs(load.force.x) > GEOMETRY_EPSILON ||
        Math.abs(load.force.y) > GEOMETRY_EPSILON ||
        Math.abs(load.torque) > GEOMETRY_EPSILON;
      if (active) {
        body.addForce({ x: load.force.x, y: load.force.y }, true);
        body.addTorque(load.torque, true);
      }
    }

    this.world.step();
    this.tick += 1;
    for (const definition of this.dynamicBodies) {
      const sleeping = this.rigidBody(definition.id).isSleeping();
      const previous = this.sleepingByBody[definition.id] ?? false;
      if (sleeping !== previous) {
        this.events.push({
          type: sleeping ? 'body-slept' : 'body-woke',
          tick: this.tick,
          bodyId: definition.id,
        });
      }
      this.sleepingByBody[definition.id] = sleeping;
    }
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
      fields: this.fields.map(copyFieldState),
      queuedCommands: [...this.queuedCommands].sort(compareCommands).map(cloneCommand),
      sleepingByBody: { ...this.sleepingByBody },
      ruleState: { ...this.ruleState },
    };
  }

  restore(snapshot: GameSnapshot): void {
    this.assertAlive();
    this.assertCompatibleSnapshot(snapshot);
    const replacement = RAPIER.World.restoreSnapshot(new Uint8Array(snapshot.physics));
    replacement.timestep = FIXED_DT;
    this.world.free();
    this.world = replacement;
    this.bodyHandles = { ...snapshot.bodyHandles };
    this.fields = snapshot.fields.map((field) => ({
      id: field.id,
      position: { ...field.position },
      angle: field.angle,
      enabled: field.enabled,
    }));
    this.queuedCommands = snapshot.queuedCommands.map(cloneCommand);
    this.sleepingByBody = { ...snapshot.sleepingByBody };
    this.ruleState = { ...snapshot.ruleState };
    this.tick = snapshot.tick;
    this.events = [];
    this.indexFields();
    this.assertSnapshotContents();
    this.renderState = this.buildRenderState();
  }

  predict(command: GameCommand): Prediction {
    this.assertAlive();
    return predictFromSimulation(this, command);
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

  private applyQueuedCommands(): void {
    const commands = [...this.queuedCommands].sort(compareCommands);
    this.queuedCommands = [];
    for (const command of commands) {
      const field = this.requiredField(command.fieldId);
      if (command.type === 'move-field') {
        field.position.x = dequantizePosition(command.xQ);
        field.position.y = dequantizePosition(command.yQ);
      } else if (command.type === 'rotate-field') {
        field.angle = dequantizeAngle(command.angleQ);
      } else {
        field.enabled = command.enabled;
      }
    }
  }

  private buildRenderState(): RenderState {
    const bodies = this.dynamicBodies.map((definition) => {
      const body = this.rigidBody(definition.id);
      const translation = body.translation();
      const velocity = body.linvel();
      const position = { x: translation.x, y: translation.y };
      const angle = body.rotation();
      return {
        id: definition.id,
        position,
        angle,
        linearVelocity: { x: velocity.x, y: velocity.y },
        angularVelocity: body.angvel(),
        sleeping: body.isSleeping(),
        pieces: [...definition.pieces]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((piece) => ({
            id: piece.id,
            worldPolygon: transformPolygon(piece.localPolygon, position, angle),
          })),
      };
    });

    const fields = this.fieldDefinitions.map((definition) => {
      const state = this.requiredField(definition.id);
      return {
        id: definition.id,
        worldPolygon: fieldWorldPolygon(definition, state),
        position: { ...state.position },
        angle: state.angle,
        forceDensityWorld: rotateVector(definition.forceDensityLocal, state.angle),
        enabled: state.enabled,
      };
    });

    return {
      tick: this.tick,
      bodies,
      staticBodies: staticRenderBodies(this.level),
      fields,
      events: this.events.map((event) => ({ ...event })),
    };
  }

  private rigidBody(id: string): RAPIER.RigidBody {
    const handle = this.bodyHandles[id];
    if (handle === undefined) throw new Error(`missing Rapier handle for body ${id}`);
    return this.world.getRigidBody(handle);
  }

  private requiredField(id: string): MutableFieldState {
    const field = this.fieldById.get(id);
    if (field === undefined) throw new Error(`missing state for field ${id}`);
    return field;
  }

  private indexFields(): void {
    this.fieldById.clear();
    for (const field of this.fields) {
      if (this.fieldById.has(field.id)) throw new Error(`duplicate snapshot field ID: ${field.id}`);
      this.fieldById.set(field.id, field);
    }
  }

  private assertSnapshotContents(): void {
    if (this.fields.length !== this.fieldDefinitions.length) {
      throw new Error('snapshot field count does not match level');
    }
    for (const definition of this.fieldDefinitions) this.requiredField(definition.id);
    for (const body of this.dynamicBodies) this.rigidBody(body.id);
    for (const command of this.queuedCommands) {
      validateCommand(command);
      if (!this.fieldDefinitionById.has(command.fieldId)) {
        throw new Error(`snapshot command references unknown field ${command.fieldId}`);
      }
    }
  }

  private assertCompatibleSnapshot(snapshot: GameSnapshot): void {
    if (snapshot.levelId !== this.level.id || snapshot.levelVersion !== this.level.version) {
      throw new Error('snapshot level ID/version does not match this game');
    }
    if (snapshot.simulationVersion !== SIMULATION_VERSION) {
      throw new Error('snapshot simulation version is incompatible');
    }
    if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0) {
      throw new Error('snapshot tick must be a non-negative integer');
    }
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
