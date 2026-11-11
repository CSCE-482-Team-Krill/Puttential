# Community editor and publishing review

Reviewed November 9, 2026, from `0bdfe8d`. The review follows the creator's path
through editing, local recovery, playtest, authenticated publication, immutable
storage, public browsing, and unranked playback.

## Corrections

| Area                       | Failure                                                                                                                                                                         | Correction and evidence                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor gestures            | Undo or document replacement during a drag could restore obsolete geometry on release.                                                                                          | Cancel gestures when their source document changes; browser regression preserves both the undo and the original ball position.                                                                                                 |
| Recovery revisions         | Loading another copy of a draft changed the adapter's remembered revision, even if the user canceled replacing their edits. Imports could inherit a previously loaded revision. | The editor supplies the revision of its current document explicitly; device recovery tests reject a stale save after reopening a different revision.                                                                           |
| Repository recovery        | Reloading a saved repository draft lost its save revision and could not save over its own file.                                                                                 | Persist a document/revision envelope and continue reading legacy document-only recovery. Existing malformed-recovery preservation and board-bounds checks retain their assertions against the new envelope.                    |
| Concurrent device saves    | Separate tabs could pass the same localStorage revision check before either write.                                                                                              | Serialize the complete read/check/write with browser Web Locks where available. Revision checks remain active without Web Locks.                                                                                               |
| Draft listing              | One malformed percent-encoded storage key prevented the whole library from loading.                                                                                             | Ignore malformed draft keys while retaining valid drafts and the original stored data.                                                                                                                                         |
| Delayed library loads      | A response could replace edits made after Open was clicked without asking, because the confirmation used an old dirty flag.                                                     | Read the current dirty state when replacement occurs; a delayed-response browser regression cancels replacement and preserves the edits.                                                                                       |
| Import conversion          | Sampling intervals above 120 remained invalid when prediction length was already within 1,200 ticks.                                                                            | Clamp the interval independently without changing the original document or simulation.                                                                                                                                         |
| Publishing transport       | The route duplicated the strict reader and accepted JSONP MIME types, unsupported charsets, and content encoding.                                                               | Authenticate first and use the existing bounded UTF-8 strict JSON reader. Real-route tests reject these headers and oversized data.                                                                                            |
| Proof validation           | The MVP route used the engine's canonical setup check without the community contract's exact property checks.                                                                   | Share exact placement/inventory/command validation between candidate proofs and publication. Integration tests reject decorated placements and commands. Golden candidate identities and replay scenes remain unchanged.       |
| Publication quota          | Concurrent verified submissions could exceed ten maps in a rolling hour.                                                                                                        | Lock the guest row for the final quota check and insert; replay runs outside the transaction. The regression initially admitted two final-slot submissions and now admits exactly one.                                         |
| Verification admission     | Failed solutions never consumed the publication quota and could trigger unlimited replays.                                                                                      | Persist a separate 30-check admission window, counting failed proofs across replicas. Tests cover exhaustion, window expiry, and acknowledged retries bypassing exhausted limits.                                              |
| Community fetches          | Supplying a caller cancellation signal replaced the request timeout.                                                                                                            | Combine caller cancellation and the deadline; unit coverage exercises each independently.                                                                                                                                      |
| Community retries          | Retrying a failed refresh used the previous pagination cursor.                                                                                                                  | Remember the failed request's cursor separately from the next-page cursor. Browser coverage checks both page retries and refresh retries.                                                                                      |
| Lost publication responses | Leaving the publish form discarded the request ID, allowing a retry to create another map after the original committed.                                                         | Journal the exact payload, request ID, and metadata in sessionStorage before sending. The real-database browser flow loses a committed response, closes/reopens playtest, and retrieves the same map with the same request ID. |
| Playtest feedback          | Unsupported publication properties were only reported after solving and submitting; setup errors could leave disabled controls without an explanation.                          | Show community profile incompatibilities before publication and surface engine/setup errors in the playtest panel.                                                                                                             |
| Daily/community races      | A delayed background daily response could overwrite the selected community map's loading state or notice.                                                                       | Guard selection-owned state by its generation and preserve community notices; a delayed daily-failure browser regression keeps the map playable.                                                                               |

## Branch ownership

Gesture commits also check their source document inside the history state update,
so a queued undo cannot be followed by a stale pointer-release commit.

Fixes are applied at their first owning review branch and merged through the
dependent branches. All updates preserve existing history and PR bases.

| Branch                                   | Direct change                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `review/community-01-shared-editor`      | Gesture cancellation                                                            |
| `review/community-02-json`               | Inherits the shared-editor correction                                           |
| `review/community-03-map-validation`     | Independent preview sampling conversion                                         |
| `review/community-04-replay-parity`      | Shared strict placement validation                                              |
| `review/community-05-verifier-prototype` | Inherits the preceding corrections                                              |
| `review/community-06-website-editor`     | Device/repository recovery and delayed-load protection                          |
| `review/community-07-publishing-api`     | Strict transport/proofs and database publishing/admission limits                |
| `review/community-08-publishing-ui`      | Request cancellation, retries, playtest feedback, and daily/community isolation |
| `review/community-09-release-docs`       | Operating limits and this verification record                                   |
| `community-editor`                       | Integrated result of the complete review stack                                  |

## Verification

Verification uses Node 24.19.0 and fresh local PostgreSQL 17 databases named
`puttential_audit_test` and `puttential_review_final_test` on loopback port 55436,
with the opening course set. No configured application database or credentials
are changed.

- `npm test`: 115 passed, zero failed, one existing Windows symlink-privilege skip.
- `npm run test:integration`: all 10 passed, using real PostgreSQL and real Rapier replays.
- `npm run typecheck` and `npm run format:check`: passed.
- `npm run community:profile`: all 33 fixture/source snapshots unchanged; 21
  accepted directly and all 33 accepted after the existing explicit conversions.
- The first full browser run passed 77/79; two assertions still read the former
  repository recovery representation. After adapting those representation reads
  and adding a delayed-load regression, the focused 11-test run passed.
- An intermediate repeated run exposed the queued undo/release race and a replay
  fixture nickname collision in the reused database. The gesture commit guard
  was strengthened, and the final suite uses a separate freshly seeded database.
- `npm run test:e2e`: all 80 passed in the final complete run. This includes the
  lost committed publication response, form reopening with the same request ID,
  unchanged published map identity, two-guest replay, recovery, and drag checks.
- The publishing and interrupted-drag cases also passed a focused three-repeat
  run (12 checks).
- `npm run editor:build` and `npm run game:build`: passed.
- `npm run test:ui:production`: passed against the built production server;
  `/` returns 200 and the development-only `/modal-preview` returns 404.
- `git diff --check`: passed. The integrated source and final review branch
  were compared directly before push.

Screenshots from the real publication flow are generated in
`artifacts/community-publishing/`; desktop and phone evidence was inspected.
The shared engine digest remains
`a042654dea091d65014ab2471a6204bdd052deb2318eda09ca17f5b90da33158`.

## Practical limits

This remains the documented synchronous publishing MVP. OS-isolated verifier
workers, a global replay capacity limit, moderation, cloud drafts, and community
rankings are outside this review. Browser saves without Web Locks cannot promise
atomic simultaneous writes. Local recovery is still a device-local recovery slot,
not independent backups of every open tab. Publication retries survive form
closure and reload in the same tab when sessionStorage is available; storage
failures retain in-memory retries only. No production deployment or production
database migration is performed by this review.
