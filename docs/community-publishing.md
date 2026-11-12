# Community publishing MVP

The website uses the existing Next.js Node.js routes, Prisma/PostgreSQL and shared
Rapier engine. Verification runs synchronously inside a Vercel request. No VM,
queue service or additional provider is required. This MVP supersedes the earlier
DigitalOcean deployment prerequisite for community publishing.

## Publish and play

1. Open Editor, create a map or import JSON, and select Playtest.
2. Place the available tiles and press Play. Reach the goal to unlock publishing.
3. Enter a title and optional description, then select Publish map.
4. The server validates the exact course and placement and replays the solution.
   Only successful replays create a published map. A failed request can be retried.
5. Open the returned link, or select the map in Community. Links survive refresh
   and work in other browsers. Community play is unranked and does not submit
   daily runs or change daily standings.

Drafts remain on the device. Publication saves a separate immutable snapshot;
subsequent editor changes do not change published maps. Publishing an edited map
creates a new map/link. Creator names use the existing guest profile nickname.
Maps are listed newest first, 20 per page. Solutions and internal ownership fields
are excluded from public responses.

The publishing form journals its exact submission and request ID in sessionStorage
before sending. If the server commits but its response is lost, reopening playtest
offers **Retry publication**, which resends the saved proof and metadata without
another solve. **Edit publication** explicitly starts a new submission.
New attempts save the original guest ID before sending; retries never create a guest
or switch owners. Older saved attempts may have an unknown owner.
When browser storage is unavailable, retries are retained only while the form is open.

## Deploy on the existing Vercel project

Use the existing root directory `src/frontend` and workspace install/build settings.
No new environment variables are needed: retain `DATABASE_URL` and the exact
`APP_ORIGIN` for each environment. The publishing route has `maxDuration = 60`.

Before releasing the new application, run `npm run db:migrate` against the intended
database. The additive `20261109000000_community_maps` migration creates one table;
existing daily courses and results are preserved. Then build/deploy normally.
Builds do not automatically migrate databases. Generate the client locally with
`npm run db:generate` after pulling the schema change.

## API

- `GET /api/community?cursor=<last-map-id>`: public summaries and next cursor.
- `GET /api/community/<id>`: public map, configuration and immutable rules.
- `POST /api/community`: authenticated guest publication. Send `expectedGuestId`,
  a UUID `requestId`, `title`, `description`, editor `document` and solved `placement`.
  Returns `{ map }` with status 201. Repeating the same request returns the same
  map; changing its content under the same request ID returns 409.

Requests are bounded to 256 KiB, use the existing community profile limits and
replay at most 7,200 physics ticks. Imported preview lengths are capped at 1,200
ticks without changing simulation behavior. Preview sampling intervals are independently capped
at 120 ticks. Each guest may publish ten maps in a rolling hour; the final quota
check and insert are serialized in the database so concurrent submissions cannot
exceed it. Each guest may also start 30 solution checks per one-hour admission
window, including unsuccessful proofs. Acknowledged publication retries bypass
both limits. The API uses the shared strict UTF-8 JSON transport and rejects extra
placement or command properties before replay.
Verification uses the same setup/rotation and goal evaluation in editor and server.
This MVP does not provide the earlier plan's OS isolation, fixed worker capacity,
moderation dashboard, cloud drafts or community rankings. A platform timeout does
not publish a map unless verification completed and the database insert committed;
retrying the same submission retrieves that publication.

The playtest panel shows unsupported community properties before publication and
surfaces engine/setup errors. Device and repository recovery record the revision
of the document being edited; loading another draft does not alter that revision.
Device saves use the browser's Web Locks API where available to serialize
cross-tab conflict checks. Browsers without Web Locks retain revision checks but
cannot guarantee atomic simultaneous saves. Recovery remains device-local; it is
not a cloud backup.

## Verification

The existing CI runs community publishing tests through `test:integration` and
`test:e2e`. Use a disposable local test database, migrate it, and provision the
opening courses as described in the main README. Focused checks:

```sh
npx tsx --test tests/community-publishing.integration.ts
npm run test:e2e -- tests/community-publishing.spec.ts
```

The browser test exercises real guest cookies, editor import, successful playtest,
publication, another browser opening the share link, refresh, community browsing,
playback and result sharing. It verifies that community play never starts a daily
ranked run. Screenshots are written under `artifacts/community-publishing/`.
