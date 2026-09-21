import type { GameCommand } from './types';

export const POSITION_QUANTUM = 1 / 1024;
export const ANGLE_QUANTUM = (Math.PI * 2) / 4096;

function assertQuantizedInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

export function validateCommand(command: GameCommand): void {
  if (!command.fieldId) throw new Error('command fieldId must not be empty');
  assertQuantizedInteger(command.sequence, 'command sequence');
  if (command.sequence < 0) throw new Error('command sequence must be non-negative');
  if (command.type === 'move-field') {
    assertQuantizedInteger(command.xQ, 'move-field xQ');
    assertQuantizedInteger(command.yQ, 'move-field yQ');
  } else if (command.type === 'rotate-field') {
    assertQuantizedInteger(command.angleQ, 'rotate-field angleQ');
  }
}

export function compareCommands(a: GameCommand, b: GameCommand): number {
  return a.sequence - b.sequence;
}

export function dequantizePosition(value: number): number {
  return value * POSITION_QUANTUM;
}

export function dequantizeAngle(value: number): number {
  return value * ANGLE_QUANTUM;
}

export function quantizePosition(value: number): number {
  if (!Number.isFinite(value)) throw new Error('position must be finite');
  return Math.round(value / POSITION_QUANTUM);
}

export function quantizeAngle(value: number): number {
  if (!Number.isFinite(value)) throw new Error('angle must be finite');
  return Math.round(value / ANGLE_QUANTUM);
}
