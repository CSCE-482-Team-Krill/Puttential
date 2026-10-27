import type { GameCommand } from './types';

export const POSITION_QUANTUM = 1 / 1024;
export const ANGLE_QUANTUM = Math.PI / 1800;

function assertQuantizedInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

export function validateCommand(command: GameCommand): void {
  assertQuantizedInteger(command.sequence, 'command sequence');
  if (command.sequence < 0) throw new Error('command sequence must be non-negative');
  if (command.type === 'move-field') {
    assertQuantizedInteger(command.xQ, 'move-field xQ');
    assertQuantizedInteger(command.yQ, 'move-field yQ');
  }
  if (command.type === 'set-field-angle') {
    assertQuantizedInteger(command.angleQ, 'set-field-angle angleQ');
    if (command.angleQ < 0 || command.angleQ > 3599)
      throw new Error('angleQ must be between 0 and 3599');
  } else if (command.type === 'set-field-enabled') {
    if (typeof command.enabled !== 'boolean') throw new Error('enabled must be boolean');
  } else if (command.type !== 'move-field') throw new Error('Unknown setup command');
}

export function compareCommands(a: GameCommand, b: GameCommand): number {
  return a.sequence - b.sequence;
}

export function dequantizePosition(value: number): number {
  return value * POSITION_QUANTUM;
}

export function quantizePosition(value: number): number {
  if (!Number.isFinite(value)) throw new Error('position must be finite');
  return Math.round(value / POSITION_QUANTUM);
}
