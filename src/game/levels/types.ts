import type { Vec2 } from '../types';

/**
 * A level is plain JSON data: everything here must survive
 * `JSON.parse(JSON.stringify(level))` unchanged. Behavior such as force laws
 * lives in the engine and is selected by `kind`.
 */
export const LEVEL_FORMAT_VERSION = 1;

/** Vertices in the owner's local frame. */
export type PolygonShape = Readonly<{ kind: 'polygon'; points: readonly Vec2[] }>;
/** Centered on the owner's local origin. */
export type RectangleShape = Readonly<{ kind: 'rectangle'; width: number; height: number }>;
/** Centered on the owner's local origin. */
export type CircleShape = Readonly<{ kind: 'circle'; radius: number }>;

/** Body pieces must be convex; a polygon piece winds counter-clockwise. */
export type PieceShape = PolygonShape | RectangleShape | CircleShape;
/** A field polygon may be concave and wind either way. */
export type FieldShape = PolygonShape | RectangleShape;

export type ConvexPieceDefinition = Readonly<{
  id: string;
  shape: PieceShape;
  density?: number;
}>;

export type SurfaceMaterial = Readonly<{
  restitution: number;
}>;

export type DynamicBodyDefinition = Readonly<{
  id: string;
  position: Vec2;
  angle: number;
  linearVelocity?: Vec2;
  angularVelocity?: number;
  density: number;
  material: SurfaceMaterial;
  ccd: boolean;
  canSleep?: boolean;
  pieces: readonly ConvexPieceDefinition[];
}>;

export type StaticBodyDefinition = Readonly<{
  id: string;
  position: Vec2;
  angle: number;
  material: SurfaceMaterial;
  pieces: readonly ConvexPieceDefinition[];
}>;

/**
 * A field's force law, in the field's local frame. `strength` and `density`
 * are force per unit of body area. A radial `source` must lie inside the
 * field shape.
 */
export type FieldForceDefinition =
  | Readonly<{ kind: 'uniform'; density: Vec2 }>
  | Readonly<{ kind: 'attractor'; source: Vec2; strength: number }>
  | Readonly<{ kind: 'repulsor'; source: Vec2; strength: number }>;

export type FieldZoneDefinition = Readonly<{
  id: string;
  shape: FieldShape;
  position: Vec2;
  angle: number;
  enabled: boolean;
  force: FieldForceDefinition;
}>;

/** Solved once the body's position stays inside the bounds for `holdSeconds`. */
export type GoalDefinition = Readonly<{
  bodyId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  holdSeconds: number;
}>;

export type Level = Readonly<{
  formatVersion: typeof LEVEL_FORMAT_VERSION;
  id: string;
  version: number;
  gravity: Vec2;
  dynamicBodies: readonly DynamicBodyDefinition[];
  staticBodies: readonly StaticBodyDefinition[];
  fields: readonly FieldZoneDefinition[];
  goal: GoalDefinition;
  prediction?: Readonly<{
    maxTicks: number;
    sampleEveryTicks: number;
  }>;
}>;
