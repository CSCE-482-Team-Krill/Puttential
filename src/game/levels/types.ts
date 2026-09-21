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

export type FieldZoneDefinition = Readonly<{
  id: string;
  localPolygon: readonly Vec2[];
  position: Vec2;
  angle: number;
  forceDensityLocal: Vec2;
  enabled: boolean;
}>;

export type Level = Readonly<{
  id: string;
  version: number;
  gravity: Vec2;
  dynamicBodies: readonly DynamicBodyDefinition[];
  staticBodies: readonly StaticBodyDefinition[];
  fields: readonly FieldZoneDefinition[];
  prediction?: Readonly<{
    maxTicks: number;
    sampleEveryTicks: number;
  }>;
}>;
