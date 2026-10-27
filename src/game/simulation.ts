import RAPIER from '@dimforge/rapier2d-compat';
import { ANGLE_QUANTUM, compareCommands, dequantizePosition, validateCommand } from './commands';
import { PORTAL_DELAY_SECONDS, PORTAL_COOLDOWN_SECONDS, isCourseObject } from './objects/catalog';
import { bodyTouchesBounds } from './objects/bounds';
import { levelBounds } from './levels/codec';
import { centerZoneEntry, zoneContact } from './objects/zones';
import { boundsOverlap, pointInPolygon, polygonBounds, transformPolygon } from './geometry/polygon';
import { triangulateSimplePolygon } from './geometry/polygon';
import { shapePolygon } from './geometry/shapes';
import { GEOMETRY_EPSILON } from './geometry/vector';
import { sortById } from './ids';
import type { FieldZoneDefinition, Level } from './levels/types';
import { assertPositiveInteger, parseLevel } from './levels/parse';
import {
  buildPhysicsWorld,
  renderPiece,
  resolveBodyPieces,
  staticRenderBodies,
} from './objects/bodies';
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
  GameFailure,
  Prediction,
  PredictionOptions,
  PredictionSample,
  PendingTeleport,
  RenderField,
  RenderState,
  RenderStaticBody,
  Vec2,
} from './types';

export const FIXED_DT = 1 / 120;

type BodyPose = Readonly<{ position: Vec2; centerOfMass: Vec2 }>;

type DynamicBody = Readonly<{ id: string; pieces: readonly ResolvedPiece[]; radius: number }>;
type Field = Readonly<{
  definition: FieldZoneDefinition;
  localTriangles: readonly Vec2[][];
  densityAt: ForceDensity;
}>;
type Zone = Readonly<{
  definition: FieldZoneDefinition;
  state: FieldState;
  polygon: readonly Vec2[];
  triangles: readonly (readonly Vec2[])[];
  sweepShapes: readonly RAPIER.Triangle[];
  bounds: ReturnType<typeof polygonBounds>;
}>;
type MutableFieldState = {
  id: string;
  position: { x: number; y: number };
  angle: number;
  enabled: boolean;
};

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
  private readonly bounds: ReturnType<typeof levelBounds>;
  private failure: GameFailure | undefined;
  // Level data, sorted by ID once so every tick iterates in the same order.
  private readonly dynamicBodies: readonly DynamicBody[];
  private readonly staticBodies: readonly RenderStaticBody[];
  private readonly fields: readonly Field[];

  private world!: RAPIER.World;
  private bodyHandles: Record<string, number> = {};
  private fieldStates = new Map<string, MutableFieldState>();
  private queuedCommands: GameCommand[] = [];
  private tick = 0;
  private destroyedBodies: Record<string, 'water' | 'lava'> = {};
  private portalLocks: Record<string, string> = {};
  private submergedBodies = new Set<string>();
  private burntBodies = new Set<string>();
  private pendingTeleports: Record<string, PendingTeleport> = {};
  private portalCooldowns: Record<string, number> = {};
  private preparedZones: readonly Zone[] | undefined;
  private portalPartners = new Map<string, Zone>();

  // Derived from field state; cleared whenever a field moves or toggles.
  private preparedFields: readonly (PreparedField & { centerRequired: boolean })[] | undefined;
  private renderFields: readonly RenderField[] | undefined;
  private renderState!: RenderState;

  constructor(data: Level, snapshot?: GameSnapshot) {
    const level = parseLevel(data);
    this.level = level;
    this.bounds = levelBounds(level);
    this.dynamicBodies = sortById(level.dynamicBodies).map((body) => {
      const pieces = resolveBodyPieces(body);
      const radius = Math.max(
        ...pieces.map((p) =>
          p.shape.kind === 'circle'
            ? p.shape.radius
            : Math.max(...p.outline.map((v) => Math.hypot(v.x, v.y))),
        ),
      );
      return { id: body.id, pieces, radius };
    });
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
    this.fieldStates = new Map(
      this.fields.map(({ definition }) => [definition.id, copyFieldState(definition)]),
    );
    this.renderState = this.buildRenderState();
  }

  queueCommand(command: GameCommand): void {
    validateCommand(command);
    if (
      this.fields.some(
        ({ definition }) => definition.id === command.fieldId && isCourseObject(definition.force),
      )
    )
      throw new Error('Course hazards and portals are fixed during play');
    if (!this.fieldStates.has(command.fieldId)) {
      throw new Error(`unknown field ID: ${command.fieldId}`);
    }
    if (this.queuedCommands.some((queued) => queued.sequence === command.sequence)) {
      throw new Error(`duplicate queued command sequence: ${command.sequence}`);
    }
    this.queuedCommands.push({ ...command });
  }

  private lastMovement: Record<string, number> = {};

  movement() {
    return this.lastMovement;
  }
  hasPendingTeleports() {
    return Object.keys(this.pendingTeleports).length > 0;
  }

  applySetup(commands: readonly GameCommand[]): void {
    if (this.tick !== 0 || this.queuedCommands.length)
      throw new Error('Setup requires an untouched tick-zero world');
    for (const command of commands) this.queueCommand(command);
    this.applyQueuedCommands();
    this.renderState = this.buildRenderState();
  }

  step(): void {
    if (this.failure) return;
    this.applyQueuedCommands();
    this.checkBounds();
    if (this.failure) {
      this.renderState = this.buildRenderState();
      return;
    }
    this.applyZones();
    this.applyFieldLoads();
    const before = this.zoneGeometry().length
      ? new Map(
          this.dynamicBodies
            .filter(
              (body) =>
                !this.destroyedBodies[body.id] &&
                !this.burntBodies.has(body.id) &&
                !this.pendingTeleports[body.id],
            )
            .map((body) => [
              body.id,
              {
                position: { ...this.rigidBody(body.id).translation() },
                centerOfMass: { ...this.rigidBody(body.id).worldCom() },
              },
            ]),
        )
      : undefined;
    const movementStart = new Map(
      this.dynamicBodies.map((body) => [body.id, { ...this.rigidBody(body.id).translation() }]),
    );
    this.world.step();
    this.lastMovement = Object.fromEntries(
      this.dynamicBodies.map((body) => {
        const start = movementStart.get(body.id)!;
        const end = this.rigidBody(body.id).translation();
        return [body.id, Math.hypot(end.x - start.x, end.y - start.y)];
      }),
    );
    if (before) this.applyZones(before);
    this.tick += 1;
    if (this.releasePortals()) this.applyZones();
    this.checkBounds();
    this.renderState = this.buildRenderState();
  }

  getRenderState(): RenderState {
    return this.renderState;
  }

  snapshot(): GameSnapshot {
    return {
      levelId: this.level.id,
      levelVersion: this.level.version,
      tick: this.tick,
      physics: this.world.takeSnapshot(),
      ...(this.failure ? { failure: { ...this.failure } } : {}),
      destroyedBodies: { ...this.destroyedBodies },
      portalLocks: { ...this.portalLocks },
      pendingTeleports: structuredClone(this.pendingTeleports),
      portalCooldowns: { ...this.portalCooldowns },
      burntBodies: [...this.burntBodies].sort(),
      bodyHandles: { ...this.bodyHandles },
      fields: [...this.fieldStates.values()].map(copyFieldState),
      queuedCommands: [...this.queuedCommands]
        .sort(compareCommands)
        .map((command) => ({ ...command })),
    };
  }

  restore(snapshot: GameSnapshot): void {
    if (snapshot.levelId !== this.level.id || snapshot.levelVersion !== this.level.version) {
      throw new Error('snapshot level ID/version does not match this game');
    }
    const world = RAPIER.World.restoreSnapshot(snapshot.physics);
    world.timestep = FIXED_DT;
    this.world?.free();
    this.world = world;
    this.bodyHandles = { ...snapshot.bodyHandles };
    this.fieldStates = new Map(snapshot.fields.map((field) => [field.id, copyFieldState(field)]));
    this.queuedCommands = snapshot.queuedCommands.map((command) => ({ ...command }));
    this.tick = snapshot.tick;
    this.failure = snapshot.failure ? { ...snapshot.failure } : undefined;
    this.destroyedBodies = { ...snapshot.destroyedBodies };
    this.portalLocks = { ...snapshot.portalLocks };
    this.pendingTeleports = structuredClone(snapshot.pendingTeleports ?? {});
    this.portalCooldowns = { ...snapshot.portalCooldowns };
    this.burntBodies = new Set(snapshot.burntBodies ?? []);
    // Older lava snapshots stored disabled bodies as destroyed; keep their remains visible.
    for (const [id, cause] of Object.entries(this.destroyedBodies))
      if (cause === 'lava') {
        delete this.destroyedBodies[id];
        this.burnBody(id);
      }
    this.invalidateFields();
    this.renderState = this.buildRenderState();
  }

  /** Runs commands on a copy until settlement, failure or the tick limit. */
  predict(commands: GameCommand | readonly GameCommand[], options?: PredictionOptions): Prediction {
    const maxTicks = options?.maxTicks ?? this.level.prediction?.maxTicks ?? 1200;
    const sampleEveryTicks =
      options?.sampleEveryTicks ?? this.level.prediction?.sampleEveryTicks ?? 8;
    assertPositiveInteger(maxTicks, 'prediction maxTicks');
    assertPositiveInteger(sampleEveryTicks, 'prediction sampleEveryTicks');

    const copy = new Simulation(this.level, this.snapshot());
    try {
      for (const command of Array.isArray(commands) ? commands : [commands]) {
        copy.queueCommand(command);
      }
      const samples = [sample(copy.renderState)];
      let settled = !!copy.failure;
      while (!settled && copy.tick - this.tick < maxTicks) {
        copy.step();
        settled =
          !!copy.failure ||
          !!copy.destroyedBodies[this.level.goal.bodyId] ||
          copy.burntBodies.has(this.level.goal.bodyId) ||
          copy.renderState.bodies.every((body) => body.sleeping);
        if (settled || (copy.tick - this.tick) % sampleEveryTicks === 0) {
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
      } else if (command.type === 'set-field-angle') {
        field.angle = command.angleQ * ANGLE_QUANTUM;
      } else {
        field.enabled = command.enabled;
      }
    }
    this.invalidateFields();
  }

  private applyFieldLoads(): void {
    const fields = (this.preparedFields ??= this.fields
      .filter(
        ({ definition }) =>
          this.fieldState(definition.id).enabled &&
          definition.force.kind !== 'portal' &&
          definition.force.kind !== 'lava',
      )
      .map(({ definition, localTriangles, densityAt }) => ({
        ...prepareField(densityAt, this.fieldState(definition.id), localTriangles),
        centerRequired: definition.force.kind === 'water',
      })));

    for (const body of this.dynamicBodies) {
      const rigidBody = this.rigidBody(body.id);
      if (
        this.destroyedBodies[body.id] ||
        this.burntBodies.has(body.id) ||
        this.pendingTeleports[body.id]
      )
        continue;
      rigidBody.resetForces(false);
      rigidBody.resetTorques(false);
      if (fields.length === 0) continue;

      const centerOfMass = rigidBody.worldCom();
      const activeFields = fields.filter(
        (field) =>
          !field.centerRequired ||
          field.triangles.some((triangle) => pointInPolygon(centerOfMass, triangle)),
      );
      if (!activeFields.length) continue;
      const load = calculateFieldLoad(
        {
          position: rigidBody.translation(),
          angle: rigidBody.rotation(),
          centerOfMass,
          linearVelocity: rigidBody.linvel(),
          angularVelocity: rigidBody.angvel(),
          pieces: body.pieces,
        },
        activeFields,
      );
      if (
        !Number.isFinite(load.force.x) ||
        !Number.isFinite(load.force.y) ||
        !Number.isFinite(load.torque)
      ) {
        throw new Error(`field load on body ${body.id} is not finite`);
      }
      // Skip empty loads so fields do not wake sleeping bodies they do not touch.
      if (
        Math.abs(load.force.x) > GEOMETRY_EPSILON ||
        Math.abs(load.force.y) > GEOMETRY_EPSILON ||
        Math.abs(load.torque) > GEOMETRY_EPSILON
      ) {
        rigidBody.addForce(load.force, true);
        rigidBody.addTorque(load.torque, true);
      }
    }
  }

  /** Course zones are fixed during play: geometry and Rapier sweep shapes are built once. */
  private zoneGeometry(): readonly Zone[] {
    if (this.preparedZones) return this.preparedZones;
    this.preparedZones = this.fields
      .filter(
        ({ definition }) =>
          isCourseObject(definition.force) && this.fieldState(definition.id).enabled,
      )
      .map(({ definition, localTriangles }) => {
        const state = this.fieldState(definition.id);
        const polygon = fieldWorldPolygon(definition, state);
        const triangles = localTriangles.map((t) =>
          transformPolygon(t, state.position, state.angle),
        );
        return {
          definition,
          state,
          polygon,
          triangles,
          bounds: polygonBounds(polygon),
          sweepShapes: triangles.map((t) => new RAPIER.Triangle(t[0]!, t[1]!, t[2]!)),
        };
      });
    const pairs = new Map<string, Zone[]>();
    this.portalPartners.clear();
    for (const zone of this.preparedZones)
      if (zone.definition.force.kind === 'portal') {
        const pair = pairs.get(zone.definition.force.pairId) ?? [];
        pair.push(zone);
        pairs.set(zone.definition.force.pairId, pair);
      }
    for (const pair of pairs.values())
      if (pair.length === 2) {
        this.portalPartners.set(pair[0]!.definition.id, pair[1]!);
        this.portalPartners.set(pair[1]!.definition.id, pair[0]!);
      }
    return this.preparedZones;
  }

  private bodyBounds(body: DynamicBody, position: Vec2, start: Vec2 = position) {
    return {
      minX: Math.min(start.x, position.x) - body.radius,
      maxX: Math.max(start.x, position.x) + body.radius,
      minY: Math.min(start.y, position.y) - body.radius,
      maxY: Math.max(start.y, position.y) + body.radius,
    };
  }

  private updateSubmersion(): void {
    this.submergedBodies.clear();
    const liquids = this.zoneGeometry().filter(
      (z) => z.definition.force.kind === 'water' || z.definition.force.kind === 'lava',
    );
    for (const body of this.dynamicBodies) {
      if (this.destroyedBodies[body.id] || this.pendingTeleports[body.id]) continue;
      if (this.burntBodies.has(body.id)) {
        this.submergedBodies.add(body.id);
        continue;
      }
      const rigid = this.rigidBody(body.id),
        position = rigid.translation();
      const bounds = this.bodyBounds(body, position);
      if (
        liquids.some(
          (zone) =>
            boundsOverlap(bounds, zone.bounds) && pointInPolygon(rigid.worldCom(), zone.polygon),
        )
      )
        this.submergedBodies.add(body.id);
    }
  }

  /** Check nearby zones only; captured, burnt and sunk bodies skip all zone/force work. */
  private applyZones(before?: Map<string, BodyPose>): void {
    const zones = this.zoneGeometry();
    if (!zones.length) return;
    for (const body of this.dynamicBodies) {
      if (
        this.destroyedBodies[body.id] ||
        this.burntBodies.has(body.id) ||
        this.pendingTeleports[body.id]
      )
        continue;
      const rigid = this.rigidBody(body.id);
      const position = { ...rigid.translation() },
        start = before?.get(body.id)?.position ?? position;
      const center = rigid.worldCom(),
        startCenter = before?.get(body.id)?.centerOfMass ?? center;
      const sweptBounds = this.bodyBounds(body, position, start);
      const locked = this.portalLocks[body.id];
      if (
        locked &&
        !zones.some(
          (z) =>
            z.definition.force.kind === 'portal' &&
            z.definition.force.pairId === locked &&
            boundsOverlap(this.bodyBounds(body, position), z.bounds) &&
            zoneContact(body.pieces, position, rigid.rotation(), z.polygon, z.triangles).touching,
        )
      )
        delete this.portalLocks[body.id];
      const canSweep =
        !!before && Math.hypot(position.x - start.x, position.y - start.y) > GEOMETRY_EPSILON;
      let shapes: RAPIER.Shape[] | undefined;
      const contacts = [];
      for (const zone of zones) {
        const force = zone.definition.force;
        if (!boundsOverlap(sweptBounds, zone.bounds)) continue;
        if (
          force.kind === 'portal' &&
          (locked === force.pairId ||
            this.tick < (this.portalCooldowns[body.id] ?? 0) ||
            !this.portalPartners.has(zone.definition.id))
        )
          continue;
        const centerInside = pointInPolygon(center, zone.polygon);
        if (force.kind === 'water' && !centerInside) continue;
        const contact =
          force.kind === 'lava'
            ? { touching: centerInside, submerged: false }
            : zoneContact(body.pieces, position, rigid.rotation(), zone.polygon, zone.triangles);
        let time = contact.touching ? (before ? 1 : 0) : Infinity;
        if (force.kind === 'lava')
          time = centerZoneEntry(startCenter, center, zone.polygon) ?? Infinity;
        if (canSweep && force.kind === 'portal') {
          shapes ??= Array.from(
            { length: rigid.numColliders() },
            (_, i) => rigid.collider(i).shape,
          );
          const displacement = { x: position.x - start.x, y: position.y - start.y };
          for (const shape of shapes)
            for (const sweep of zone.sweepShapes) {
              const hit = shape.castShape(
                start,
                rigid.rotation(),
                displacement,
                sweep,
                { x: 0, y: 0 },
                0,
                { x: 0, y: 0 },
                0,
                1,
                true,
              );
              if (hit) time = Math.min(time, hit.time_of_impact);
            }
        }
        if (Number.isFinite(time)) contacts.push({ zone, contact, time });
      }
      contacts.sort(
        (a, b) =>
          a.time - b.time ||
          Number(b.zone.definition.force.kind === 'lava') -
            Number(a.zone.definition.force.kind === 'lava'),
      );
      for (const { zone, contact, time } of contacts) {
        const force = zone.definition.force;
        if (force.kind === 'water') {
          const velocity = rigid.linvel();
          if (
            contact.submerged &&
            Math.hypot(velocity.x, velocity.y) <= force.sinkSpeed &&
            Math.abs(rigid.angvel()) <= force.sinkSpeed
          ) {
            this.destroyBody(body.id, 'water');
            break;
          }
        } else if (force.kind === 'lava' || force.kind === 'portal') {
          // Lava waits for center entry; portals still capture on collider contact.
          if (before) {
            const impact =
              force.kind === 'lava'
                ? {
                    x: startCenter.x + (center.x - startCenter.x) * time - (center.x - position.x),
                    y: startCenter.y + (center.y - startCenter.y) * time - (center.y - position.y),
                  }
                : {
                    x: start.x + (position.x - start.x) * time,
                    y: start.y + (position.y - start.y) * time,
                  };
            rigid.setTranslation(impact, true);
          }
          if (force.kind === 'lava') this.burnBody(body.id);
          else {
            const exit = this.portalPartners.get(zone.definition.id)!;
            this.pendingTeleports[body.id] = {
              entryId: zone.definition.id,
              exitId: exit.definition.id,
              pairId: force.pairId,
              readyTick:
                this.tick +
                (before ? 1 : 0) +
                Math.max(1, Math.ceil((force.delaySeconds ?? PORTAL_DELAY_SECONDS) / FIXED_DT)),
              velocity: { ...rigid.linvel() },
              angle: rigid.rotation(),
              angularVelocity: rigid.angvel(),
              rotationDelta: force.rotateVelocity ? exit.state.angle - zone.state.angle : 0,
              cooldownTicks: Math.max(
                1,
                Math.ceil((force.cooldownSeconds ?? PORTAL_COOLDOWN_SECONDS) / FIXED_DT),
              ),
            };
            rigid.setEnabled(false);
          }
          break;
        }
      }
    }
  }

  private releasePortals(): boolean {
    let released = false;
    for (const body of this.dynamicBodies) {
      const pending = this.pendingTeleports[body.id];
      if (!pending || pending.readyTick > this.tick) continue;
      const exit = this.zoneGeometry().find((z) => z.definition.id === pending.exitId)!;
      const rigid = this.rigidBody(body.id),
        c = Math.cos(pending.rotationDelta),
        s = Math.sin(pending.rotationDelta);
      rigid.setEnabled(true);
      rigid.setTranslation(exit.state.position, true);
      rigid.setLinvel(
        {
          x: pending.velocity.x * c - pending.velocity.y * s,
          y: pending.velocity.x * s + pending.velocity.y * c,
        },
        true,
      );
      rigid.setRotation(pending.angle + pending.rotationDelta, true);
      rigid.setAngvel(pending.angularVelocity, true);
      this.portalLocks[body.id] = pending.pairId;
      this.portalCooldowns[body.id] = this.tick + pending.cooldownTicks;
      delete this.pendingTeleports[body.id];
      released = true;
    }
    return released;
  }

  private checkBounds(): void {
    for (const body of this.dynamicBodies) {
      if (this.destroyedBodies[body.id] || this.pendingTeleports[body.id]) continue;
      const rigid = this.rigidBody(body.id);
      if (!bodyTouchesBounds(body.pieces, rigid.translation(), rigid.rotation(), this.bounds)) {
        this.failure = { reason: 'out-of-bounds', bodyId: body.id };
        return;
      }
    }
  }

  private burnBody(id: string): void {
    const rigid = this.rigidBody(id);
    rigid.setEnabled(true);
    rigid.resetForces(false);
    rigid.resetTorques(false);
    rigid.setLinvel({ x: 0, y: 0 }, false);
    rigid.setAngvel(0, false);
    rigid.setBodyType(RAPIER.RigidBodyType.Fixed, false);
    this.burntBodies.add(id);
    delete this.pendingTeleports[id];
  }

  private destroyBody(id: string, cause: 'water' | 'lava'): void {
    this.destroyedBodies[id] = cause;
    this.rigidBody(id).setEnabled(false);
  }

  private buildRenderState(): RenderState {
    this.updateSubmersion();
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
        sleeping: this.pendingTeleports[body.id]
          ? false
          : !!this.destroyedBodies[body.id] ||
            this.burntBodies.has(body.id) ||
            rigidBody.isSleeping(),
        burnt: this.burntBodies.has(body.id),
        teleporting: !!this.pendingTeleports[body.id],
        ...(this.destroyedBodies[body.id] ? { destroyed: this.destroyedBodies[body.id]! } : {}),
        submerged: !this.destroyedBodies[body.id] && this.submergedBodies.has(body.id),
        pieces: body.pieces.map((piece) => renderPiece(piece, position, angle)),
      };
    });

    const fields = (this.renderFields ??= this.fields.map(({ definition }) => {
      const state = this.fieldState(definition.id);
      return {
        id: definition.id,
        worldPolygon: fieldWorldPolygon(definition, state),
        position: { ...state.position },
        angle: state.angle,
        enabled: state.enabled,
        force: definition.force,
      };
    }));

    return {
      tick: this.tick,
      ...(this.failure ? { failure: { ...this.failure } } : {}),
      bodies,
      staticBodies: this.staticBodies,
      fields,
    };
  }

  private invalidateFields(): void {
    this.preparedFields = undefined;
    this.renderFields = undefined;
    this.preparedZones = undefined;
    this.portalPartners.clear();
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
