import type { Bounds } from '../geometry/polygon';
import type { Vec2 } from '../types';

export type ConvexPieceDefinition = Readonly<{
  id: string;
  localPolygon: readonly Vec2[];
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

export type FieldParam = number | string | boolean | Vec2;

/** Body material at one quadrature point, expressed in the field's local frame. */
export type FieldSample = Readonly<{
  point: Vec2;
  /** Velocity of the body material at `point`. */
  velocity: Vec2;
  /** Density of the body piece being sampled. */
  density: number;
}>;

/**
 * A field's force law. The engine never inspects `kind` or `params`; they only
 * describe the force for rendering and serialization. `densityAt` must be pure
 * so replays stay deterministic.
 */
export type FieldForce = Readonly<{
  kind: string;
  params: Readonly<Record<string, FieldParam>>;
  /** Force per unit area at the sample, in the field's local frame. */
  densityAt(sample: FieldSample): Vec2;
  /** Returns an error message when the force is invalid for this polygon. */
  validate?(localPolygon: readonly Vec2[]): string | null;
}>;

export type FieldZoneDefinition = Readonly<{
  id: string;
  localPolygon: readonly Vec2[];
  position: Vec2;
  angle: number;
  enabled: boolean;
  force: FieldForce;
}>;

export type LevelGoal = Readonly<{
  /** Dynamic body that must reach the goal. */
  bodyId: string;
  /** World-space box that must contain the body's origin. */
  area: Bounds;
  /** How long the body must stay inside without leaving. */
  holdSeconds: number;
}>;

export type Level = Readonly<{
  id: string;
  name: string;
  gravity: Vec2;
  dynamicBodies: readonly DynamicBodyDefinition[];
  staticBodies: readonly StaticBodyDefinition[];
  fields: readonly FieldZoneDefinition[];
  goal: LevelGoal;
}>;
