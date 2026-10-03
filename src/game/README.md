# Puttential game core

This folder contains the deterministic, framework-independent TypeScript simulation. It has no DOM, rendering, input, or UI-framework dependencies. The frontend owns its fixed-step loop and turns input into quantized commands.

## API

```ts
import { createGame, parseLevel, quantizePosition } from 'puttential/game';

const response = await fetch('/levels/bar-around-corner.json');
const level = parseLevel(await response.json());
const game = await createGame(level);
game.queueCommand({
  type: 'move-field',
  fieldId: 'drop-field',
  xQ: quantizePosition(-3.3),
  yQ: quantizePosition(1.0),
  sequence: 1,
});
game.queueCommand({
  type: 'set-field-enabled',
  fieldId: 'drop-field',
  enabled: true,
  sequence: 2,
});
game.step();
const frame = game.getRenderState();
game.destroy();
```

`step()` advances exactly `1 / 120` second. Commands queued between steps are applied at the next tick in ascending `sequence` order. Position values use a `1 / 1024` world-unit grid; use `quantizePosition` at the input boundary. A field's shape, angle, and force come from the level and cannot be changed by player commands.

## Levels

A level is plain JSON with no code in it, so it can come from a file, the `Puzzle.configuration` database column, or a level editor without being bundled with the engine. `levels/types.ts` defines the format (`Level`), and the sample levels are the `.json` files in `levels/`.

`parseLevel(data)` takes untrusted data, checks all of it, and returns a `Level`; it throws an error naming the first bad property, such as `level.fields[0].shape.width must be positive`. `createGame` runs the same check. `JSON.stringify(parseLevel(data))` writes a level back out with its properties in a fixed order.

| Property | Meaning |
| --- | --- |
| `formatVersion` | Must equal `LEVEL_FORMAT_VERSION` (currently `1`). Raise it only when existing files stop meaning the same thing. |
| `id`, `name` | The level's identifier, which snapshots record, and its display name. |
| `gravity` | World gravity vector. |
| `dynamicBodies`, `staticBodies` | Bodies made of `pieces`, each with a convex `shape`. `material.restitution` is the bounce, from 0 to 1. |
| `fields` | Force zones; see below. |
| `goal` | `{ bodyId, area: { minX, maxX, minY, maxY }, holdSeconds }`; see Goals below. |

Bodies and fields share one ID namespace.

Every piece and field has a `shape`, in its owner's local frame:

| Shape | Meaning |
| --- | --- |
| `{ "kind": "rectangle", "width": 2.4, "height": 0.55 }` | Centered on the local origin. |
| `{ "kind": "circle", "radius": 0.35 }` | Centered on the local origin. Body pieces only. |
| `{ "kind": "polygon", "points": [{ "x": 0, "y": 0 }, ...] }` | Any other outline. A piece polygon must be convex and counter-clockwise. |

A circle collides as a true circle and has a disc's mass and moment of inertia, so it spins when something applies a torque and keeps spinning afterwards. Field loads on a circle are integrated over a 32-sided polygon of the same area. To add a shape, add it to `levels/types.ts`, read it in `levels/parse.ts`, and give it an outline in `geometry/shapes.ts` and a collider in `objects/bodies.ts`.

Unknown properties and unknown `kind` values are rejected instead of ignored, so an engine that does not know a mechanic refuses the level instead of simulating a different puzzle. To add a mechanic, add its data to `levels/types.ts` and `levels/parse.ts` and its behavior to the engine: a new force is another `kind` in `FieldForceDefinition`, and a new sort of object (a joint, a trigger, a hazard) is a new optional top-level array whose entries have an `id` and a `kind`. Existing level files stay valid, and `formatVersion` does not change.

## Fields

A field's shape is a rectangle or any simple polygon with either winding, including concave outlines. Every field has a `force`, which is data naming a force law by `kind`. For each overlap between a body piece and the field, the engine evaluates that law at three quadrature points per overlap triangle and integrates the result into a force and torque on the body. Samples and returned vectors are in the field's local frame, so moving or rotating a field carries its force with it:

```json
{
  "id": "well",
  "shape": {
    "kind": "polygon",
    "points": [
      { "x": -2, "y": -2 }, { "x": 2, "y": -2 }, { "x": 2, "y": -1 },
      { "x": -1, "y": -1 }, { "x": -1, "y": 2 }, { "x": -2, "y": 2 }
    ]
  },
  "position": { "x": 0, "y": 0 },
  "angle": 0,
  "enabled": true,
  "force": { "kind": "attractor", "source": { "x": -1.5, "y": -1.5 }, "strength": 10 }
}
```

The forces are `{ kind: 'uniform', density }`, `{ kind: 'attractor', source, strength }`, `{ kind: 'repulsor', source, strength }`, `{ kind: 'vortex', center, strength }` (counter-clockwise for positive strength), and `{ kind: 'drag', coefficient }`, which opposes the body's velocity. Radial and vortex `strength` is force per unit of body area, with a 0.05 world-unit softening radius near the source, and the source or center must lie inside the field's shape. `getRenderState()` exposes each field's `force` unchanged, and `forceDensity(force)` returns its force law so a renderer can sample it for drawing.

The force laws themselves live in `objects/forces.ts`. To add one, add its data shape to `FieldForceDefinition`, read it in `readForce` in `levels/parse.ts`, and implement it in `forceDensity` and `forceValidationError`:

- `forceDensity` returns a function from `{ point, velocity, density }` to force per unit area. `velocity` is the body material's velocity at `point` and `density` is the sampled piece's density, so drag or buoyancy-style forces need no other engine changes. It must be a pure function of its input.
- `forceValidationError` returns an error message for `parseLevel` to report, or `null`.

A simple polygon cannot contain holes or crossing edges.

## Goals

Every level has a `goal`: a dynamic `bodyId`, a world-space `area` box, and `holdSeconds`. After each tick the engine checks whether the body's origin is inside the box; `getRenderState().goal` reports `inside`, `heldTicks`, `holdTicks`, and `completedTick`, which is set once the body has stayed inside for the hold time and never cleared. Goal progress is part of snapshots, and `predict` stops early when the goal completes.

## Sample levels

`levels/` holds `bar-around-corner.json`, `radial-relay.json`, `spin-cycle.json`, `key-turn.json`, and `corner-pocket.json`. All fields start disabled; enable them with `set-field-enabled` and move them with `move-field`.

Every body in these levels has a restitution of 0.8. Two colliding surfaces bounce with the average of their restitutions, so the moving bodies are set to 0.8 along with the walls. The layouts were designed for nearly inelastic walls and have not been retuned, so check each level is still solvable before using it as a daily puzzle.

## Game state

`getRenderState()` returns plain data with no Rapier handles. Each piece is either `{ kind: 'polygon', worldPolygon }` or `{ kind: 'circle', center, radius }`; a circle's spin is the body's `angle`. `snapshot()` captures the Rapier world plus field positions and queued commands; `restore()` requires a snapshot from the same level.

`predict(commands, { maxTicks, sampleEveryTicks? })` runs the commands on a copy of the game until the goal completes, every body sleeps outside the goal, or `maxTicks` is reached, and never changes the live game. It records a sample every `sampleEveryTicks` ticks (default 1). Levels have no tick limit; the caller chooses one.

Ordinary motion and collisions are frictionless: colliders use zero contact friction and dynamic bodies use zero linear and angular damping. Drag should come from a field whose force opposes `sample.velocity`, so it exists only inside that field.

## Determinism

Bodies, pieces, and fields are processed in ID order (by code unit, not locale), commands are quantized, the timestep is fixed, and Rapier is pinned to `0.20.0`. Replaying the same commands gives the same result in the same JavaScript runtime; cross-browser bitwise equality is not guaranteed because JavaScript trigonometry may differ.

Type-check with `npx tsc --noEmit` from the repository root.
