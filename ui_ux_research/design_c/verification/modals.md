# Modal verification

Implemented the five layouts from the supplied Figma screenshot using Design C's existing green glass palette. Profile and leaderboard values remain sample data; audio controls save preferences, but audio playback is not implemented.

Checked the actual `Modal` component in an isolated preview route because the main page already fails to compile against the current game engine. The panels can now be reviewed locally at `/modal-preview` while the main page's engine mismatch remains unresolved.

- Browser checks passed at 1440 × 1000, 390 × 844, and 320 × 568: all five modals and the existing result panel fit the viewport without horizontal overflow.
- Checked Help expansion, Calendar selection, close button, Escape, backdrop dismissal, focus trapping and restoration, and settings persistence across reopening and reloading.
- Inspected the saved desktop and mobile PNG screenshots. `modal-help-expanded-*` shows the Help content; the remaining images show the initial layouts.
- `npm run build` remains blocked by existing missing level exports from `@game`. Frontend type-checking also reports existing mismatches involving level names, field polygons and force functions, circle render pieces, and goal state. The new modal and icon modules reported no TypeScript errors.
- Root `npx tsc --noEmit` remains blocked by existing outdated level definitions/validation and missing generated Prisma client modules.

Screenshots use the temporary preview's background. They verify modal appearance independently of the unavailable main game page.
