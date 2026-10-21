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

A level is plain JSON with no code in it, so it can come from a file, the `Puzzle.configuration` database column, or a level editor without being bundled with the engine. `levels/types.ts` defines the format (`Level`), and `levels/bar-around-corner.json` and `levels/radial-relay.json` are the two sample levels.

`parseLevel(data)` takes untrusted data, checks all of it, and returns a `Level`; it throws an error naming the first bad property, such as `level.fields[0].force.kind is unsupported`. `createGame` runs the same check. `JSON.stringify(parseLevel(data))` writes a level back out with its properties in a fixed order.

| Property | Meaning |
| --- | --- |
| `formatVersion` | Must equal `LEVEL_FORMAT_VERSION` (currently `1`). Raise it only when existing files stop meaning the same thing. |
| `id`, `version` | Identify the level's content. Snapshots and saved solutions record both; raise `version` whenever a change would alter a replay. |
| `gravity` | World gravity vector. |
| `dynamicBodies`, `staticBodies` | Bodies made of `pieces`, each with a convex `shape`. `material.restitution` is the bounce, from 0 to 1. |
| `fields` | Force zones; see below. |
| `goal` | `{ bodyId, minX, maxX, minY, maxY, holdSeconds }`: solved once the body's position stays inside the bounds for `holdSeconds`. The engine stores the goal but does not evaluate it yet. |
| `prediction` | Optional default `{ maxTicks, sampleEveryTicks }` for `predict`. |

Bodies and fields share one ID namespace.

Every piece and field has a `shape`, in its owner's local frame:

| Shape | Meaning |
| --- | --- |
| `{ "kind": "rectangle", "width": 2.4, "height": 0.55 }` | Centered on the local origin. |
| `{ "kind": "circle", "radius": 0.35 }` | Centered on the local origin. Body pieces only. |
| `{ "kind": "polygon", "points": [{ "x": 0, "y": 0 }, ...] }` | Any other outline. A piece polygon must be convex and counter-clockwise. |

A circle collides as a true circle and has a disc's mass and moment of inertia, so it spins when something applies a torque and keeps spinning afterwards. Field loads on a circle are integrated over a 32-sided polygon of the same area. To add a shape, add it to `levels/types.ts`, read it in `levels/parse.ts`, and give it an outline in `geometry/shapes.ts` and a collider in `objects/bodies.ts`.

Unknown properties and unknown `kind` values are rejected instead of ignored, so an engine that does not know a mechanic refuses the level instead of simulating a different puzzle. To add a mechanic, add its data to `levels/types.ts` and `levels/parse.ts` and its behavior to the engine: a new force is another `kind` in `FieldForceDefinition`, and area mechanics can reuse the field shape and catalog; unrelated objects such as joints can use a new optional top-level array. Existing level files stay valid, and `formatVersion` does not change.

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

The forces are `{ kind: 'uniform', density }`, `{ kind: 'attractor', source, strength }`, and `{ kind: 'repulsor', source, strength }`. Radial `strength` is force per unit of body area, with a 0.05 world-unit softening radius near the source, and the source must lie inside the field's shape. `getRenderState()` exposes each field's `force` unchanged for drawing.

The force laws themselves live in `objects/forces.ts`. To add one, add its data shape to `FieldForceDefinition`, read it in `readForce` in `levels/parse.ts`, and implement it in `forceDensity` and `forceValidationError`:

- `forceDensity` returns a function from `{ point, velocity, density }` to force per unit area. `velocity` is the body material's velocity at `point` and `density` is the sampled piece's density, so drag or buoyancy-style forces need no other engine changes. It must be a pure function of its input.
- `forceValidationError` returns an error message for `parseLevel` to report, or `null`.

A simple polygon cannot contain holes or crossing edges.

## Fixed course zones

Water, lava and portals reuse `fields` geometry and plain-data `force` definitions. `isCourseObject` marks them as fixed level geometry: player commands cannot move or toggle them, and the frontend excludes them from tile counts. The editor still exposes transforms, outlines and enabled state.

| Definition | Behavior |
| --- | --- |
| `{ kind: 'water', drag: 12, sinkSpeed: 0.06 }` | Overlap-integrated drag proportional to material velocity/density, activated only when the body’s center of mass is inside the zone. Full submersion plus linear and angular speeds below the threshold destroys the body. Drag must be in `(0, 60]`; sink speed in `(0, 1]`. |
| `{ kind: 'lava' }` | Center-of-mass entry zeros linear/angular velocity, chars the body and turns it into a fixed collider. The remains stay visible and the shot fails; center-path intersection catches fast crossings. |
| `{ kind: 'portal', pairId: 'pair-1', rotateVelocity: false, delaySeconds: 0.25, cooldownSeconds: 0.75 }` | Two enabled ends with the same nonempty pair ID capture bodies, wait for the configured delay, then release them at the partner’s center. At most two ends per ID; incomplete pairs are inert. Velocity is preserved; optional rotation follows the difference in endpoint angles. After emerging, the cooldown blocks all portals and re-entry to the same pair remains locked until the body leaves it. Delay accepts `(0, 10]` seconds, cooldown `(0, 30]`; omitted values use the defaults shown. |

Zone events run before and after each fixed physics step in stable order. Lava uses swept center-of-mass entry; portals retain Rapier collider sweeps. Contacts resolve in travel order; lava wins simultaneous contacts. A portal exit placing the body’s center inside lava chars and stops it immediately. Circular shore/contact tests use the true radius, while drag still uses the shared field integration. Polygon containment uses clipped area, including concave zones.

Water-sunk rigid bodies are disabled and exposed as `RenderBody.destroyed`. Lava instead exposes `burnt: true`, zeroes momentum and fixes the body in place. Center entry into either liquid exposes `submerged` for drawing; merely grazing a liquid does not slow, burn or visually dip the body. Captured portal bodies are disabled while waiting and expose `teleporting: true`; they do not count as settled or score while waiting. Snapshots retain pending transfers, incoming velocity/angle, release ticks, cooldowns, burnt-body state and portal locks alongside Rapier state. Prediction stops when the target sinks or burns. The shared frontend prevents these failed bodies from scoring and reports the reason.

Fixed zone polygons, bounds, Rapier triangle sweep shapes and partner lookups are cached. Bounds checks reject distant zones before clipping or sweeping. Waiting, sunk and burnt bodies skip force/zone processing; portal and lava zones are excluded from force integration. Timing uses simulation ticks, never wall-clock timers. Liquid textures and their mirrored repeating patterns are shared and cached by the renderer.

## Sample levels

In `bar-around-corner.json`, a solid divider forces the bar to turn downward before it can travel right to the goal. The `drop-field` and `push-field` uniform forces start disabled.

In `radial-relay.json`, a circular ball starts in the lower-left chamber. The concave `launch` repulsor sends it through the upper passage above the divider; the `catch` attractor guides it into the upper-right goal. Both fields start disabled, so enable them with `set-field-enabled` commands and move them with `move-field` commands.

Both levels use a restitution of 0.8 on every body. Two colliding surfaces bounce with the average of their restitutions, so the ball and bar are set to 0.8 along with the walls. The field positions in these files were tuned for nearly inelastic walls and need retuning: enabling the fields where they sit no longer brings the body to rest in the goal.

## Game state

`getRenderState()` returns plain data with no Rapier handles. Each piece is either `{ kind: 'polygon', worldPolygon }` or `{ kind: 'circle', center, radius }`; a circle's spin is the body's `angle`. `snapshot()` captures the Rapier world plus field positions and queued commands; `restore()` requires a snapshot from the same level ID and version.

`predict(commands, options?)` runs the commands on a copy of the game until every body sleeps or the tick limit is reached, and never changes the live game. `options` can override the level's `{ maxTicks, sampleEveryTicks }`.

Ordinary motion and collisions are frictionless: colliders use zero contact friction and dynamic bodies use zero linear and angular damping. Drag should come from a field whose force opposes `sample.velocity`, so it exists only inside that field.

## Determinism

Bodies, pieces, and fields are processed in ID order (by code unit, not locale), commands are quantized, the timestep is fixed, and Rapier is pinned to `0.20.0`. Replaying the same commands gives the same result in the same JavaScript runtime; cross-browser bitwise equality is not guaranteed because JavaScript trigonometry may differ.

Type-check with `npx tsc --noEmit` from the repository root.

## Shared frontend and editor

Design C and `level-editor/` share `src/frontend/`. The canvas consumes the engine's polygon/circle render records; playtest and prediction call this engine directly. The shared frontend tracks goal hold time after every engine tick, since engine render state does not include goal progress.

Editor saves use this exact JSON format under `levels/authored/`. Separate `.editor.json` files hold authoring metadata; they are not part of `Level`. `levels/codec.ts` handles editor documents and explicit legacy migration, while `parseLevel` remains the engine schema authority. Metadata for supported force controls lives in `objects/catalog.ts`; shape presets live in `objects/presets.ts`. See [the editor guide](../../level-editor/README.md).
