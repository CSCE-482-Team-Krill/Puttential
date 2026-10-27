# Iteration two frontend boundaries

`app/page.tsx` composes the canvas, bounded shared simulation, competitive session and server-backed panels. `engine-adapter.ts` binds the shared canonical setup and evaluator in `../game/run-evaluation.ts`; the server imports those same functions for verification. Practice remains API-independent and unranked.

`course-session.ts` persists immutable starts before HTTP, confirms the guest cookie, acknowledges a counted start before playback and records terminal intents before completion. IndexedDB has bounded memory fallback, and Web Locks prevent another tab from taking over an active run.

`../shared/puzzle-contracts.ts` and `../shared/response-validation.ts` define revision 3.1 for both ends. The frontend validator module reexports the shared implementation. All competitive HTTP operations use one bounded scheduler; completion receipts have priority.

Archive, profile, leaderboard and sharing consume persisted server values. Board pagination binds viewer, puzzle, scope, view and revision; copy text uses rank only for the exact saved best run. Date rollover retains the canvas and draft when content is unchanged.

See [release instructions](../../docs/iteration-two-release.md) and [integrated evidence](../../artifacts/iteration-two-completion/verification.md). The earlier `artifacts/iteration-two` evidence describes the preceding frontend-only revision.
