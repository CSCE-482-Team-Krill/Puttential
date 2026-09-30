import type { Bounds } from './geometry/polygon';
import type { FieldForce } from './levels/types';

export type Vec2 = Readonly<{ x: number; y: number }>;

export type GameCommand =
  | Readonly<{
      type: 'move-field';
      fieldId: string;
      xQ: number;
      yQ: number;
      sequence: number;
    }>
  | Readonly<{
      type: 'set-field-enabled';
      fieldId: string;
      enabled: boolean;
      sequence: number;
    }>;

export type FieldState = Readonly<{
  id: string;
  position: Vec2;
  angle: number;
  enabled: boolean;
}>;

export type RenderPiece = Readonly<{ id: string; worldPolygon: readonly Vec2[] }>;

export type RenderBody = Readonly<{
  id: string;
  position: Vec2;
  angle: number;
  linearVelocity: Vec2;
  angularVelocity: number;
  sleeping: boolean;
  pieces: readonly RenderPiece[];
}>;

export type RenderStaticBody = Readonly<{
  id: string;
  pieces: readonly RenderPiece[];
}>;

export type RenderField = Readonly<{
  id: string;
  worldPolygon: readonly Vec2[];
  position: Vec2;
  angle: number;
  enabled: boolean;
  /** Force description in the field's local frame; apply `position` and `angle` to draw it. */
  force: Pick<FieldForce, 'kind' | 'params'>;
}>;

export type GoalState = Readonly<{
  bodyId: string;
  area: Bounds;
  inside: boolean;
  /** Consecutive ticks the body has been inside, up to now. */
  heldTicks: number;
  holdTicks: number;
  /** First tick at which the hold was satisfied; null until then. */
  completedTick: number | null;
}>;

export type RenderState = Readonly<{
  tick: number;
  bodies: readonly RenderBody[];
  staticBodies: readonly RenderStaticBody[];
  fields: readonly RenderField[];
  goal: GoalState;
}>;

export type GameSnapshot = Readonly<{
  levelId: string;
  tick: number;
  physics: Uint8Array;
  bodyHandles: Readonly<Record<string, number>>;
  fields: readonly FieldState[];
  queuedCommands: readonly GameCommand[];
  goal: Readonly<{ heldTicks: number; completedTick: number | null }>;
}>;

export type PredictionSample = Readonly<{
  tick: number;
  bodies: readonly Readonly<{
    id: string;
    position: Vec2;
    angle: number;
  }>[];
}>;

export type Prediction = Readonly<{
  ticksSimulated: number;
  settled: boolean;
  samples: readonly PredictionSample[];
  finalState: RenderState;
  finalSnapshot: GameSnapshot;
}>;

export type PredictionOptions = Readonly<{
  maxTicks: number;
  /** Defaults to every tick. */
  sampleEveryTicks?: number;
}>;

export type Game = {
  queueCommand(command: GameCommand): void;
  step(): void;
  getRenderState(): RenderState;
  snapshot(): GameSnapshot;
  restore(snapshot: GameSnapshot): void;
  predict(commands: GameCommand | readonly GameCommand[], options: PredictionOptions): Prediction;
  destroy(): void;
};
