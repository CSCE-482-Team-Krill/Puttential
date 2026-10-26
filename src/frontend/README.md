# Iteration two frontend boundaries

`app/page.tsx` composes the existing canvas and modal shell. `puzzle.ts` remains the backward-compatible unranked executor used by the editor. It has no guest, competitive HTTP or recovery-store dependency. Local execution retains the existing goal evaluation until E0 arrives; its finite cap does not establish authoritative replay semantics.

`course-session.ts` is the competitive wrapper. It freezes and persists a complete start, confirms guest identity, acquires execution ownership, accepts the server acknowledgement, then calls the executor. Completion intents are immutable and remain recoverable through processing/infrastructure failures. Merely seeing another tab's accepted run never interrupts it; explicit recovery needs an exclusive run lock. Unsupported coordination leaves observed executions unresolved.

`engine-adapter.ts` defines the frontend integration port. `deliveredEngine` is deliberately undefined. A separately delivered E0 binding must implement supported versions, canonical field conversion, complete placement, tick-zero setup application, shared evaluation/movement metrics and local rules. The frontend has not added angle commands or replay logic to the engine. Test fixtures use explicit fixture version strings and cannot activate production playback.

`../shared/puzzle-contracts.ts` is the **proposed revision 3.1** transport, not evidence of backend agreement. `response-validation.ts` checks canonical Level separately from API metadata, identities, revisions, dates, numeric limits and board lifecycle. All competitive operations share `PuzzleApi` and `RequestScheduler`; completion registration gets foreground receipt priority, with bounded background fairness and Retry-After respected.

`progress-storage.ts` uses IndexedDB with a 3-second open bound and 2-second transaction bound. Failure retains the identical operation in memory and displays refresh recovery limitations. `run-ownership.ts` uses nonwaiting Web Locks with a 1-second foreground bound. `guest-session.ts` bounds bootstrap to 25 seconds, lock acquisition to 2 seconds, and confirms the cookie with GET me. The scheduler bounds each interactive operation to 10 seconds including waiting for a slot.

Panels consume server values. Leaderboard windows are viewer/puzzle/scope/view/generation bound and restart invalidated pagination at most once per action. Sharing refreshes the saved run's current availability and uses rank only for the exact viewer/scope/bestRunId. Cancellation retains historical verification and removes ranking claims. Draft identity excludes source/day/progress/availability changes; rollover uses server durations anchored to monotonic elapsed time.

See [actual evidence and open dependencies](../../artifacts/iteration-two/implementation-evidence.md). No real competitive integration is claimed until G0, E0 and backend delivery pass.
