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

`step()` advances exactly `1 / 120` second. Commands queued between steps are applied at the next tick in ascending `sequence` order. Position values use a `1 / 1024` world-unit grid; use `quantizePosition` at the input boundary. A field's shape, angle, force direction or source, and strength come from the level and cannot be changed by player commands.

Fields accept any simple polygon with either winding, including concave outlines. Radial fields use a local source point inside the polygon, which moves and rotates with the field:

```ts
{
  id: 'well',
  kind: 'attractor', // or 'repulsor'
  localPolygon: [
    { x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: -1 },
    { x: -1, y: -1 }, { x: -1, y: 2 }, { x: -2, y: 2 },
  ],
  position: { x: 0, y: 0 },
  angle: 0,
  sourceLocal: { x: -1.5, y: -1.5 },
  strength: 10,
  enabled: true,
}
```

`strength` is force per unit of body area. The force points toward the source for an attractor and away for a repulsor, with a 0.05 world-unit softening radius near the source. Uniform fields continue to use `forceDensityLocal` and may omit `kind`. A simple polygon cannot contain holes or crossing edges.

`getRenderState()` returns plain data with world-space polygons and no Rapier handles. `snapshot()` includes both Rapier state and all authoritative TypeScript state. `restore()` requires the same level ID, level version, and simulation version.

`predict(commands, options?)` restores the live snapshot into a separate Rapier world, applies one command or an array of commands, and runs fixed ticks until every moving body sleeps or the prediction limit is reached. A caller can override the level defaults with `{ maxTicks, sampleEveryTicks }`; it never changes the live game.

Ordinary motion and collisions are frictionless: colliders use zero contact friction and dynamic bodies use zero linear and angular damping. The example course uses restitution 0.01 on its bodies and rails for less rebound. A future friction field should apply velocity-opposing force from polygon overlap so drag exists only inside that field.

## Determinism contract

- Dynamic bodies, material pieces, and fields are integrated in stable ID order.
- Uniform fields use exact polygon overlap area and centroid. Radial fields use deterministic three-point quadrature over overlap triangles; no random samples are used.
- The fixed timestep, command quantization, simulation version, and Rapier `0.20.0` dependency are pinned.
- Replay and prediction are tested for identical snapshots in the same JavaScript runtime.
- Cross-browser or cross-device bitwise equality is not promised because JavaScript trigonometry may differ. If that becomes a requirement, the geometry and simulation wrapper should move behind the same API into Rust/Wasm.

Run `npm test` and `npm run typecheck` from the repository root.
