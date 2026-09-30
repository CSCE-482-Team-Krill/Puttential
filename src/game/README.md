# Puttential game core

This folder contains the deterministic, framework-independent TypeScript simulation. It has no DOM, rendering, input, or UI-framework dependencies. The frontend owns its fixed-step loop and turns input into quantized commands.

## API

```ts
import {
  createGame,
  exampleBarPuzzle,
  quantizePosition,
} from 'puttential/game';

const game = await createGame(exampleBarPuzzle);
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

Fields accept any simple polygon with either winding, including concave outlines. Every field has a `force` that the engine treats uniformly: for each overlap between a body piece and the field, it evaluates `force.densityAt(sample)` at three quadrature points per overlap triangle and integrates the result into a force and torque on the body. Samples and returned vectors are in the field's local frame, so moving or rotating a field carries its force with it:

```ts
{
  id: 'well',
  localPolygon: [
    { x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: -1 },
    { x: -1, y: -1 }, { x: -1, y: 2 }, { x: -2, y: 2 },
  ],
  position: { x: 0, y: 0 },
  angle: 0,
  force: attractorForce({ x: -1.5, y: -1.5 }, 10),
  enabled: true,
}
```

Built-in forces are `uniformForce(density)`, `attractorForce(source, strength)`, and `repulsorForce(source, strength)`. Radial `strength` is force per unit of body area, with a 0.05 world-unit softening radius near the source, and the source must lie inside the polygon. A custom force is any object matching `FieldForce`:

- `densityAt({ point, velocity, density })` returns force per unit area. `velocity` is the body material's velocity at `point` and `density` is the sampled piece's density, so drag or buoyancy-style forces can be expressed without engine changes. It must be a pure function of its input.
- `kind` and `params` are plain data describing the force for rendering and serialization; `getRenderState()` exposes them unchanged.
- `validate(localPolygon)` optionally returns an error message, which `validateLevel` reports.

A simple polygon cannot contain holes or crossing edges.

## Alternative level: Radial Relay

`radialRelay` and `radialRelayGoal` are exported from `puttential/game`. A puck starts in the lower-left chamber. The concave `launch` repulsor sends it through the upper passage above the divider; the `catch` attractor guides it into the upper-right goal. The goal requires the puck center to remain inside its bounds for 0.5 seconds. Both fields start disabled, so enable them with `set-field-enabled` commands to play the preset route. They can also be moved with `move-field` commands for alternate trajectories.

`getRenderState()` returns plain data with world-space polygons and no Rapier handles. `snapshot()` captures the Rapier world plus field positions and queued commands; `restore()` requires a snapshot from the same level ID and version.

`predict(commands, options?)` runs the commands on a copy of the game until every body sleeps or the tick limit is reached, and never changes the live game. `options` can override the level's `{ maxTicks, sampleEveryTicks }`.

Ordinary motion and collisions are frictionless: colliders use zero contact friction and dynamic bodies use zero linear and angular damping. Drag should come from a field whose force opposes `sample.velocity`, so it exists only inside that field.

## Determinism

Bodies, pieces, and fields are processed in ID order (by code unit, not locale), commands are quantized, the timestep is fixed, and Rapier is pinned to `0.20.0`. Replaying the same commands gives the same result in the same JavaScript runtime; cross-browser bitwise equality is not guaranteed because JavaScript trigonometry may differ.

Type-check with `npx tsc --noEmit` from the repository root.
