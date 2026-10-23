# Puttential logo research and design decision

Research date: October 22, 2026.

## Recommendation

Use a flat, open P shaped like a putting path, with a detached circular ball at its terminal. Pair it with a lowercase charcoal wordmark. The green is the existing interface green, `#2e7d32`; the lettering is the existing ink, `#2d3a3a`. The lettering uses outlined Trebuchet MS Bold, connecting the identity to the website's heading family without relying on a visitor's installed fonts.

The mark was constructed directly as vector geometry. Its character comes from the interrupted bowl of the P and the ball, rather than lighting, texture, or an elaborate golf illustration.

## Diagnosis of the previous logo

The old bitmap has dimensional letters, multiple dark outlines, a large shaded ball, luminous green trails, and a dark atmospheric backdrop. Those choices compete with the website's paper surfaces, restrained borders, flat green controls, and small line icons. At its actual 128px desktop width, the small lettering and overlapping treatments lose clarity. Its dark rectangular background also remains visible against the light header.

This is a visual assessment of the supplied artwork, not a claim about the tool that originally produced it. Making the logo feel more intentional means choosing a clear silhouette, controlling spacing, and checking its actual application size.

## Primary-source research

The following are identity designers' case studies and brands' own guidance. The application column records our interpretation for Puttential, rather than a prescription from those sources.

| Reference                                                                                                 | Published design evidence                                                                                                  | Application to Puttential                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Mastercard — Pentagram](https://www.pentagram.com/work/mastercard)                                       | The redesign isolates the two overlapping circles and pairs them with circular sans-serif letterforms for digital use.     | Reduce the artwork to a small number of shapes. Make the symbol and lettering feel related. Avoid attempting to encode every aspect of the game.                    |
| [MIT Media Lab — Pentagram](https://www.pentagram.com/work/mit-media-lab)                                 | A fixed ML monogram and related glyphs share a seven-by-seven construction grid.                                           | Give the mark explicit, reproducible geometry. One recognizable P works better here than a collection of decorative golf elements.                                  |
| [MIT Media Lab brand portal](https://www.media.mit.edu/posts/MLBrandPortal/)                              | The official system specifies the glyph/wordmark relationship, clear space, monochrome use, and size-sensitive typography. | Deliver a complete lockup and standalone mark. Keep proportions fixed and test small reproductions.                                                                 |
| [NBC — Chermayeff & Geismar & Haviv](https://cghnyc.com/work/project/nbc)                                 | The peacock was reduced from eleven feathers to six regularized shapes; its body is negative space.                        | Simplification should preserve a memorable feature. Puttential retains the ball, but removes its highlights, dimples, and shading.                                  |
| [Chase — Chermayeff & Geismar & Haviv](https://cghnyc.com/work/project/chase-bank)                        | The octagon demonstrates how an abstract, compact shape can support recognition through consistent use.                    | A logo need not depict a complete golf scene. Unlike an established bank, this new game benefits from keeping its full name alongside the mark.                     |
| [National Geographic — Chermayeff & Geismar & Haviv](https://cghnyc.com/work/project/national-geographic) | The magazine's gold border became the basis of an identity spanning other products.                                        | Extract a recognizable element of the product. The ball and its route are closer to Puttential's puzzle mechanic than a sports badge or trophy.                     |
| [Slack — Pentagram](https://www.pentagram.com/work/slack)                                                 | The hashtag was rebuilt from two geometric shape types on a grid to improve reproduction across scales and contexts.       | Use consistent weight and rounded terminals. Judge the shape at header and favicon sizes, not only on a large presentation board.                                   |
| [Linear brand guidelines](https://linear.app/brand)                                                       | The brand prioritizes monochrome wordmarks, surrounding space, and a separate compact logomark for constrained layouts.    | Preserve breathing room and supply monochrome/reversed versions. Keep the full name visible in the website header.                                                  |
| [Golf Digest — Pentagram](https://www.pentagram.com/work/golf-digest/story)                               | The masthead uses carefully refined round ball terminals and spacing to express golf through typography.                   | A small ball can carry the golf reference without a literal illustrated scene. The chosen design locates that detail in the symbol and keeps the name easy to read. |

## Principles taken from the research

1. **One main idea.** The P is also a curved route ending at a ball. The wordmark carries the product name; the symbol does not have to explain daily puzzles, force tiles, scoring, and golf simultaneously.
2. **Shape before effects.** The silhouette must work in a single flat color. No element depends on a gradient, shadow, bevel, or luminous edge.
3. **Specificity through a small detail.** The detached ball in the open P gives a familiar letter a game-related feature. Generic geometry alone would give Puttential less character.
4. **Typography belongs to the product.** Trebuchet is already used for the site's headings. Lowercase lettering gives the lockup a friendly tone, while the existing charcoal maintains visual continuity.
5. **Recognition needs a name.** Established marks can sometimes omit their wordmarks. Puttential should build recognition with the full name in its header and reserve the symbol for the browser icon and genuinely small contexts.
6. **Actual size decides.** A large identity board is useful for construction, but the shipped 180px desktop and 200px mobile/tablet lockups determine whether the design succeeds.

These are our design conclusions from the cases, not universal rules that every successful identity follows. NBC and Slack, for example, show that reduction does not require restricting every brand to one color.

## Directions compared

See [the direction comparison](logo-directions.png).

| Direction          | Strength                                                                        | Limitation                                                                          | Decision                                                                                  |
| ------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Wordmark plus ball | Quiet, readable, and economical.                                                | Offers little independent recognition at favicon size.                              | Retain its typographic restraint.                                                         |
| Flag plus ball     | Immediately suggests putting.                                                   | Closely resembles a generic course marker or interface icon; less tied to the name. | Keep flags in the course UI.                                                              |
| Open P plus ball   | Combines the initial, ball, and path in two simple forms; scales independently. | The putting-path reading is secondary to the P.                                     | Selected: the full wordmark supplies the name, while the subtle reference adds character. |

## Delivered identity and usage

- `src/frontend/public/puttential-logo.svg`: primary two-color vector lockup; 200 × 44 viewBox; all lettering is paths.
- `src/frontend/public/puttential-logo.png`: transparent 1200 × 264 fallback for existing raster consumers.
- `src/frontend/public/puttential-mark.svg`: independent transparent symbol.
- `src/frontend/public/puttential-logo-mono.svg`: charcoal single-color lockup.
- `src/frontend/public/puttential-logo-reversed.svg`: warm-white lockup for dark surfaces.
- `src/frontend/app/icon.svg`: green browser-icon tile with the same white mark.
- `src/frontend/brand-logo.tsx`: shared header asset for loading, playable, and modal-preview states.

Keep the lockup's proportions. Allow at least 8px of surrounding space at normal header size. Use the complete lockup at 180px or wider; use the separate symbol in smaller square applications. The website keeps its existing 44px minimum home-button height. Use the reversed artwork on dark surfaces; do not add an outline around the primary logo. The old raster is retained as `before-logo.png` in this directory for comparison.

## Review artifacts and verification

- [Identity proof](logo-proof.png): primary, monochrome, reversed, and 16/24/32/48px icon applications.
- [Before header](before-header.png) / [after header](after-header.png).
- [Before desktop](before-1440.png) / [after desktop](after-1440.png).
- [Before mobile](before-390.png) / [after mobile](after-390.png).
- [Narrow mobile](after-320.png).
- `before-checks.json` and `after-checks.json`: layout measurements at 320, 390, 768, 960, 1366, and 1440px; no horizontal overflow or overlap between the brand and navigation, no browser runtime errors; home action and Help checked.

Screenshots use the repository's deterministic daily-course fixture so the comparison does not depend on a database or changing puzzle. They are review images, not newly published product pages.

Completed checks:

- `npm.cmd run typecheck`: passed.
- `npm.cmd run game:build`: passed, including generation of the `/icon.svg` route.
- `npx.cmd playwright test --config artifacts/logo/playwright.config.ts`: all three existing frontend tests passed. This focused configuration reuses the running game server and avoids starting the unrelated editor.
- SVG lockup, PNG fallback, standalone symbol, and favicon returned HTTP 200 with the expected image content types.
- `git diff --check`: passed. Existing unrelated working-tree changes were preserved.
- Pre-push `npm.cmd test`: 16 passed; one editor persistence test could not create its symbolic-link fixture (`EPERM`) on this Windows host.

Rebuild vectors on Windows with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File artifacts/logo/build-logo.ps1`, then run `node artifacts/logo/render-logo.mjs` for raster exports and proof sheets. Capture the current site with `node --import tsx artifacts/logo/capture-logo.mjs after` while the game development server is running.
