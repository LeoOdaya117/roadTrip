# Verified Architecture

Verified from source on 2026-10-10. See `PROJECT_CONTEXT.md` for the current
route table, boundaries, persistence contracts, platform limits, and commands.
Canonical detailed references are `docs/ARCHITECTURE.md` and
`docs/OFFLINE_NAVIGATION.md`.

- `src/App.tsx` owns the lazy-loaded React Router v5 routes, Ionic shell, theme,
  shared navigation, and native-only status-bar setup.
- Pages compose screens; components handle presentation and local interaction;
  hooks coordinate lifecycle; Zustand owns transient shared ride state;
  services own REST, realtime, geolocation, and Dexie I/O.
- `src/services/offlineDb.ts` owns IndexedDB schema version 5. Ride deletion
  transactionally removes the session, location, tracks, photos, and outbox.
- Solo rides use `solo-` IDs and remain backend-independent. Group REST and
  realtime contracts are external to this repository.
- Android navigation uses the `OfflineNavigation` Capacitor bridge and hosted
  Valhalla by default, with an optional regional graph. It consumes accepted
  tracker locations and does not start another GPS watcher.
