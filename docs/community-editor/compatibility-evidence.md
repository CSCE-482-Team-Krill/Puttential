# Production-validator compatibility evidence

Source baseline: `b3c12425cca443a56af02e2c2a4e8430da035f83`.
Recorded November 6, 2026. This replaces the ignored planning diagnostic as the
tracked reproducible inventory; it does not establish solvability or deployment readiness.

`scripts/check-community-profile.ts` calls `validateCommunityDocument` directly.
The CPU verifier calls that same validator through `prepareCommunityCandidate`.
There is one implementation of the community profile. Existing engine codecs and
authored files are unchanged. Original and converted document hashes are recorded separately.

Run from the root with the committed lockfile:

```sh
npm ci
npm run community:profile
npm test
npm run test:community:browser
```

The checked baseline contains each authored source and sidecar checksum, matching
sidecar revision, all starter/tutorial/blank/palette snapshots, original outcomes,
explicit conversion outcomes and adjusted-copy hashes. Missing/changed cases or
checksums fail the script and CI. Updating the baseline requires explicit
`node --import tsx scripts/check-community-profile.ts --write-baseline` and review.

| Group | Total | Accepted unchanged | Accepted after explicit conversion |
| --- | --- | --- | --- |
| Authored courses | 11 | 2 | 11 |
| Starters | 2 | 0 | 2 |
| Tutorial | 1 | 0 | 1 |
| Blank template | 1 | 1 | 1 |
| Palette insertions | 18 | 18 | 18 |
| Total | 33 | 21 | 33 |

All 12 original rejections identify `level.prediction.maxTicks`. Only the named
preview conversion is needed for these fixtures. The separate static-density
conversion has a same-runtime Rapier regression proving ignored static density
does not change the replay. Neither conversion changes original files. No other
physics/geometry is clamped or repaired automatically.

Runtime: Node `24.19.0`, Rapier `0.20.0`, tsx `4.23.15`, jsonc-parser `3.3.1`,
canonicalize `2.1.0`, esbuild `0.28.2`, Playwright `1.63.0`, PostgreSQL `17`.
CI execution is configured but has not been run remotely in this session.

| Artifact | SHA-256 |
| --- | --- |
| Root lockfile | `c3ccc27d080300179dcc18cd621c88a9b9b64960f3aacbc9a6313466c872f5e0` |
| Compatibility baseline file | `afd51c0ea58c798d10d52a08a628082508e34956182b56b2c41d739df09b8bb5` |
| Canonical compatibility inventory | `4d3f5326ac8a48450d463f402f43ad4e2db79cd34505b41f9dc2a5ab9ce56d22` |
| Exact executable engine module | `a042654dea091d65014ab2471a6204bdd052deb2318eda09ca17f5b90da33158` |
| Canonical solve vector file | `f5f9b2abd9f61f87bba54dfa7c3cee44edb94d726cb94ada8ed9256281219fcb` |
| Replay scene vector file | `27fba5a91a534668a556e1a13aef0b4a74bed4709bbc2290a25f3babad43345e` |

The exact engine module is rebuilt and checked before unit/browser tests. Node
and real Chromium compare the same committed expected hashes/bytes and execute
the same module for moving circles in four directions, a compound body, a concave
field, water/lava failure, delayed portals, and successful/failed borderless play.
This is measured fixture parity, not a claim of universal cross-browser bitwise equality.

References used to review the pinned implementation:
[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785),
[Microsoft jsonc-parser 3.3.1 visitor/scanner](https://raw.githubusercontent.com/microsoft/node-jsonc-parser/v3.3.1/src/main.ts),
[canonicalize 2.1.0 serializer](https://raw.githubusercontent.com/erdtman/canonicalize/v2.1.0/lib/canonicalize.js).
