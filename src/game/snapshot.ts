import { validateCommand } from './commands';
import { SIMULATION_VERSION } from './constants';
import { compareIds, sortById } from './ids';
import type { Level } from './levels/types';
import type { FieldState, GameSnapshot } from './types';

export type MutableFieldState = {
  id: string;
  position: { x: number; y: number };
  angle: number;
  enabled: boolean;
};

export function copyFieldState(field: FieldState): MutableFieldState {
  return {
    id: field.id,
    position: { x: field.position.x, y: field.position.y },
    angle: field.angle,
    enabled: field.enabled,
  };
}

/** Checks everything except the Rapier bytes, which only Rapier can decode. */
export function assertCompatibleSnapshot(snapshot: GameSnapshot, level: Level): void {
  if (snapshot.levelId !== level.id || snapshot.levelVersion !== level.version) {
    throw new Error('snapshot level ID/version does not match this game');
  }
  if (snapshot.simulationVersion !== SIMULATION_VERSION) {
    throw new Error('snapshot simulation version is incompatible');
  }
  if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0) {
    throw new Error('snapshot tick must be a non-negative integer');
  }
  if (snapshot.fields.length !== level.fields.length) {
    throw new Error('snapshot field count does not match level');
  }
  const fieldsById = new Map(snapshot.fields.map((field) => [field.id, field]));
  if (fieldsById.size !== snapshot.fields.length) throw new Error('snapshot has duplicate field IDs');
  for (const definition of level.fields) {
    const state = fieldsById.get(definition.id);
    if (state === undefined) throw new Error(`snapshot is missing field ${definition.id}`);
    if (state.angle !== definition.angle) {
      throw new Error(`snapshot changed fixed angle for field ${definition.id}`);
    }
    if (!Number.isFinite(state.position.x) || !Number.isFinite(state.position.y) ||
      typeof state.enabled !== 'boolean') {
      throw new Error(`snapshot has invalid state for field ${definition.id}`);
    }
  }
  for (const command of snapshot.queuedCommands) {
    validateCommand(command);
    if (!fieldsById.has(command.fieldId)) {
      throw new Error(`snapshot command references unknown field ${command.fieldId}`);
    }
  }
}

function stableSnapshotMetadata(snapshot: GameSnapshot): string {
  const byKey = ([a]: [string, unknown], [b]: [string, unknown]): number => compareIds(a, b);
  return JSON.stringify({
    levelId: snapshot.levelId,
    levelVersion: snapshot.levelVersion,
    simulationVersion: snapshot.simulationVersion,
    tick: snapshot.tick,
    handles: Object.entries(snapshot.bodyHandles).sort(byKey),
    fields: sortById(snapshot.fields),
    queuedCommands: [...snapshot.queuedCommands].sort((a, b) => a.sequence - b.sequence),
    sleeping: Object.entries(snapshot.sleepingByBody).sort(byKey),
  });
}

/** FNV-1a over the Rapier bytes and metadata; stable within one JavaScript runtime. */
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
