# RoadTrip Project Notes

Verified conventions for future changes. Canonical detailed guidance remains in
`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, and
`docs/TESTING.md`.

## Architecture and code placement

- Preserve dependency direction: pages compose screens, components present and
  handle local interaction, hooks coordinate lifecycle, services own I/O,
  `src/store/` owns transient shared state, and `src/types/` owns shared
  contracts. Do not introduce a backend layer in this repository; the backend is
  external.
- Keep persistent ride state out of Zustand. Access Dexie through
  `src/services/offlineDb.ts`, not raw tables in pages/components.
- Use strict TypeScript, narrow types at integration boundaries, and `import type`
  for type-only imports. Avoid `any`, `@ts-ignore`, and unnecessary abstractions.
- Preserve React Router v5 APIs until a coordinated router migration.

## Ride lifecycle and integrations

- Treat `rideId`, the `solo-` prefix, lifecycle status, `endedAt`, and the hidden
  resume marker as cross-layer compatibility contracts.
- Apply one `LocationQualityFilter` after provider normalization. Persist accepted
  local points independently of uploads; keep batch sync feature-gated and group
  only.
- Provider switches retain the quality-filter baseline. Stopover resumes begin a
  new segment so paused movement is excluded.
- Keep realtime disabled without configuration permission and a Pusher key.
- Keep GeoJSON `[lng, lat]` and React Leaflet `[lat, lng]` order explicit.
- Clean up every watch, listener, interval, channel, map resource, and object URL.
- Add Dexie changes as a new sequential version with upgrade coverage; do not
  rewrite an existing schema version's meaning.

## UI, native behavior, and validation

- Routed Ionic pages use `IonPage`; design mobile-first and preserve safe areas,
  keyboard accessibility, visible focus, and meaningful loading/error/empty
  states.
- Feature-detect Capacitor behavior and provide browser behavior where supported.
  Mock native plugins in browser tests; physical-device checks are needed for
  Android permissions, background tracking, and native sharing.
- Add or update tests with behavior changes. The project completion policy
  requires lint, unit tests, production build/typecheck, and Cypress; native
  validation is additional when relevant. Report only checks actually run.

## Documentation facts to reconcile

- Source `src/services/offlineDb.ts:deleteSession` transactionally deletes
  sessions, locations, tracks, photos, and outbox records. The current
  `docs/ARCHITECTURE.md` history paragraph still says photo deletion is omitted.
- The current Dexie schema and migration tests use version 5, while
  `docs/TESTING.md` still mentions fresh v4 creation.

These are documentation inconsistencies observed during initialization; they do
not change the verified runtime contracts above.
