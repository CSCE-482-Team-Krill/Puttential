import type { Level } from './levels/types';

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
      type: 'rotate-field';
      fieldId: string;
      angleQ: number;
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

export type GameEvent = Readonly<{
  type: 'body-slept' | 'body-woke';
  tick: number;
  bodyId: string;
}>;

export type RenderBody = Readonly<{
  id: string;
  position: Vec2;
  angle: number;
  linearVelocity: Vec2;
  angularVelocity: number;
  sleeping: boolean;
  pieces: readonly Readonly<{ id: string; worldPolygon: readonly Vec2[] }>[];
}>;

export type RenderStaticBody = Readonly<{
  id: string;
  pieces: readonly Readonly<{ id: string; worldPolygon: readonly Vec2[] }>[];
}>;

export type RenderField = Readonly<{
  id: string;
  worldPolygon: readonly Vec2[];
  position: Vec2;
  angle: number;
  forceDensityWorld: Vec2;
  enabled: boolean;
}>;

export type RenderState = Readonly<{
  tick: number;
  bodies: readonly RenderBody[];
  staticBodies: readonly RenderStaticBody[];
  fields: readonly RenderField[];
  events: readonly GameEvent[];
}>;

export type GameSnapshot = Readonly<{
  levelId: string;
  levelVersion: number;
  simulationVersion: string;
  tick: number;
  physics: Uint8Array;
  bodyHandles: Readonly<Record<string, number>>;
  fields: readonly FieldState[];
  queuedCommands: readonly GameCommand[];
  sleepingByBody: Readonly<Record<string, boolean>>;
  ruleState: Readonly<Record<string, number | string | boolean | null>>;
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
  events: readonly GameEvent[];
  finalState: RenderState;
  finalSnapshot: GameSnapshot;
}>;

export type Game = {
  queueCommand(command: GameCommand): void;
  step(): void;
  getRenderState(): RenderState;
  snapshot(): GameSnapshot;
  restore(snapshot: GameSnapshot): void;
  predict(command: GameCommand): Prediction;
  destroy(): void;
};

export type CreateGame = (level: Level) => Promise<Game>;
