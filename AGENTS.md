# RoadTrip Agent Guide

This file is the entry point for coding agents and contributors working in this
repository. Read it before making changes, then open the detailed guide for the
area you are touching:

- [Architecture](docs/ARCHITECTURE.md) — system boundaries, runtime flows,
  persistence, and external contracts.
- [Conventions](docs/CONVENTIONS.md) — TypeScript, React, Ionic, state, storage,
  styling, and native-development rules.
- [Testing](docs/TESTING.md) — required quality gates, test strategy, and the
  current validation baseline.
- [Background geolocation setup](docs/BACKGROUND_GEO_SETUP.md) — native plugin
  permissions and device setup.

## What this project is

RoadTrip is a mobile-first Ionic React application packaged with Capacitor. It
tracks solo and group rides, displays riders on Leaflet maps, stores ride data
offline, and can replay, summarize, photograph, and share completed rides.

The main user flows are:

1. Create or join a group ride through an external REST backend, wait in the
   lobby, and receive rider locations through Laravel Echo/Pusher.
2. Start a solo ride without a backend, record the route and photos in IndexedDB,
   and resume an unfinished session later.
3. Pause a ride at a stopover, resume GPS tracking, or end the session while
   preserving its history.
4. Review history, statistics, route replay, photos, and a generated share image.

There is an Android project in `android/`. No iOS native project is committed.
The REST/realtime backend is also not part of this repository.

## Quick start

Use Node.js and the committed npm lockfile.

```bash
npm ci
npm run dev
```

On Windows PowerShell, script execution policy may block `npm.ps1`. Use the
command shim instead:

```powershell
npm.cmd ci
npm.cmd run dev
```

Vite serves the web app at `http://localhost:5173` by default. Group ride APIs
default to `http://localhost:8000/api`; solo rides can work without that backend.
Put local configuration in an ignored `.env.local` file. Every `VITE_*` value is
bundled into client code, so it must never contain a secret.

Common commands:

| Purpose | Cross-platform command | Windows PowerShell |
| --- | --- | --- |
| Development server | `npm run dev` | `npm.cmd run dev` |
| Production build and typecheck | `npm run build` | `npm.cmd run build` |
| Unit tests | `npm run test.unit -- --run` | `npm.cmd run test.unit -- --run` |
| Lint | `npm run lint` | `npm.cmd run lint` |
| Cypress E2E | `npm run test.e2e` | `npm.cmd run test.e2e` |
| Android web/native sync | `npm run build:android` | `npm.cmd run build:android` |
| Android debug build | `npm run build:android:debug` | `npm.cmd run build:android:debug` |

See [Testing](docs/TESTING.md) before relying on a command's current result.
The repository has known lint and E2E blockers, but the project policy is strict:
pre-existing failures are not a waiver for completing a change with red gates.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/pages/` | Routed Ionic screens and page-level composition |
| `src/components/` | Reusable UI, Leaflet maps, markers, stats, gallery, and share rendering |
| `src/hooks/` | Ride lifecycle, timer, network, location, sync, and realtime coordination |
| `src/services/` | REST, realtime, IndexedDB, user profile, and location-provider adapters |
| `src/store/` | Transient cross-page Zustand ride state |
| `src/types/` | Shared domain and integration types |
| `src/api/` | Read models assembled for history/statistics screens |
| `src/styles/`, `src/theme/` | Page/component styles and global Ionic design tokens |
| `android/` | Capacitor Android wrapper and native configuration |
| `cypress/` | Browser E2E tests and Cypress support code |
| `docs/` | Architecture, conventions, testing, and native setup documentation |

Generated `dist/`, `node_modules/`, Android `build/`, and Capacitor-generated
files are not source architecture. Do not edit or document them as authoritative.

## Working agreement

Before editing:

1. Inspect the route, page, hook, service, types, persistence, and tests involved
   in the complete flow. Ride behavior crosses these boundaries frequently.
2. Check `git status` and preserve unrelated user changes.
3. Read the relevant detailed guide linked above and native plugin documentation
   when location, filesystem, sharing, status bar, or Android code is involved.

While editing:

1. Preserve dependency direction: pages compose, hooks coordinate, the store owns
   transient shared state, services own I/O, and `src/types` owns shared contracts.
2. Keep web and native behavior explicit. Mock or feature-detect Capacitor APIs in
   browsers and tests; do not assume a native plugin is always available.
3. Treat ride lifecycle and persistence changes as migrations, not isolated UI
   edits. Active, paused, ended, hidden, solo, and group states must stay coherent.
4. Add or update tests with behavior changes. Do not encode production behavior
   only in mocks or leave the committed Cypress starter assertion untouched.
5. Avoid drive-by refactors, generated output, secrets, and backend assumptions
   that cannot be verified in this repository.

Before completing:

1. Run lint, unit tests, the production build/typecheck, and Cypress E2E.
2. Run Android/native validation when native code, plugins, permissions, or
   Capacitor configuration changed.
3. Fix all failures, including relevant pre-existing blockers; do not silently
   downgrade the strict all-green policy.
4. Recheck the diff for generated files, secrets, missing cleanup, and stale docs.

## Critical invariants

- `rideId` identifies a session across routes, Zustand, REST/realtime, Dexie, and
  local-storage markers. Do not translate it differently between layers.
- Solo IDs use the `solo-` prefix and must remain backend-independent. Solo points
  are appended to the local track log; group locations are periodically sent to
  the backend and the last known point is retained locally.
- GPS watches, Capacitor listeners, timers, browser listeners, Leaflet instances,
  object URLs, and realtime channels must be cleaned up on stop or unmount.
- Foreground updates are jitter-filtered. Background updates are accepted directly
  and the active provider switches with Capacitor app state.
- Pausing tracking records a `stopover` point. Ending a ride persists final stats,
  marks the session ended and hidden from resume, dispatches `ride:ended`, clears
  transient state, and resets the persisted timer.
- Dexie schema versions and stored field meanings are compatibility contracts.
  Add a new database version for schema changes; never rewrite an old version.
- Realtime is optional and must remain disabled when no Pusher key is configured
  or `VITE_ENABLE_REALTIME=false`.
- Leaflet/GeoJSON coordinates are `[longitude, latitude]`; React Leaflet positions
  are `[latitude, longitude]`. Convert only at explicit boundaries.

