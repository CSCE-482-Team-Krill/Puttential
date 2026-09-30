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

`getRenderState()` returns plain data with world-space polygons and no Rapier handles. `snapshot()` includes both Rapier state and all authoritative TypeScript state. `restore()` requires the same level ID, level version, and simulation version.

`predict(commands, options?)` restores the live snapshot into a separate Rapier world, applies one command or an array of commands, and runs fixed ticks until every moving body sleeps or the prediction limit is reached. A caller can override the level defaults with `{ maxTicks, sampleEveryTicks }`; it never changes the live game.

Ordinary motion and collisions are frictionless: colliders use zero contact friction and dynamic bodies use zero linear and angular damping. The example course uses restitution 0.01 on its bodies and rails for less rebound. Drag should come from a field whose force opposes `sample.velocity`, so it exists only inside that field.

## Determinism contract

- Dynamic bodies, material pieces, and fields are integrated in stable ID order, compared by code unit rather than locale.
- Fields use deterministic three-point quadrature over overlap triangles, which is exact for constant and linear forces; no random samples are used.
- The fixed timestep, command quantization, simulation version, and Rapier `0.20.0` dependency are pinned.
- Replaying the same commands from the same snapshot produces the same `hashSnapshot` in the same JavaScript runtime.
- Cross-browser or cross-device bitwise equality is not promised because JavaScript trigonometry may differ. If that becomes a requirement, the geometry and simulation wrapper should move behind the same API into Rust/Wasm.

Type-check with `npx tsc --noEmit` from the repository root.
