# RoadTrip Project Context

Verified from the repository on 2026-10-07. This is a point-in-time map; refresh
it after significant architecture, dependency, or command changes.

## Stack and runtime

- Mobile-first Ionic React app using React 19, Ionic React 8, Capacitor 7,
  TypeScript 5.9, Vite 5, React Router 5, and Zustand 5.
- Maps use Leaflet and React Leaflet. HTTP uses Axios. Realtime uses Laravel Echo
  with the Pusher protocol. Local structured data uses Dexie/IndexedDB.
- Browser and Android are supported targets. The committed Android app ID is
  `io.ionic.starter`; `capacitor.config.ts` enables `android.useLegacyBridge`.
  No iOS project or backend implementation is committed.
- `VITE_*` settings are bundled into client code. They are public configuration,
  not a place for credentials or privileged secrets.

## Runtime boundaries

```text
src/App.tsx routes and app shell
  -> src/pages screen composition
     -> src/components presentation and UI interaction
     -> src/hooks lifecycle and cross-service coordination
        -> src/store/rideStore.ts transient cross-page ride state
        -> src/services/ I/O and platform adapters
        -> src/api/ local history/statistics read models
        -> src/types/ shared ride and integration contracts
```

- Pages own navigation and user actions. Hooks coordinate timers, location,
  network state, synchronization, and realtime subscriptions.
- Services own REST, Echo, IndexedDB, local profile, and geolocation adapters.
- Zustand is transient. Durable ride records belong in Dexie; local storage is
  used for small preferences, timer/recovery markers, and compatibility data.
- The backend is external. Current client REST expectations live in
  `src/services/api.ts`; realtime setup and rider event handling live in
  `src/services/realtime.ts` and `src/hooks/useRideChannel.ts`.

## Routes and flows

Routes are declared in `src/App.tsx` using React Router v5 inside
`IonReactRouter`/`IonRouterOutlet`:

| Route | Main page and purpose |
| --- | --- |
| `/` | Redirect to Home |
| `/home` | Create/join group ride, start/resume solo ride, navigation |
| `/ride-lobby/:rideId` | Group ride participants and host start action |
| `/ride-map/:rideId` | Live ride map, location, timer, stopovers, photos, ride end |
| `/account` | Local display name, avatar, and appearance preferences |
| `/ride-history` | Paged local ride history, solo/group filter, previews, deletion |
| `/ride-history-stats/:rideId` | Derived ride stats, route map, replay/share entry |
| `/ride-history-stats/:rideId/share` | Configurable ride share image |
| `/ride-replay/:rideId` | Stored track replay with time-positioned photos |

Group create/join calls the external API and stores the returned ride in
Zustand and Dexie before opening the lobby. Realtime rider updates are optional.
The current client does not publish a separate ride-start event. Solo sessions
use the `solo-` ID prefix, remain backend-independent, and open the map directly.

Both ride types use the same foreground/background location providers and quality
filter. Accepted points are persisted locally; only active group rides publish
locations. Batch upload is additionally gated by
`VITE_ENABLE_LOCATION_BATCH_SYNC`. Pausing records a stopover and begins a new
segment on resume. Ending records final stats, marks the session ended and hidden
from resume, clears transient ride state, and resets the timer.

## Persistence and important contracts

- Dexie database `rideTrackerDb` currently has schema version 5. Tables are
  sessions, latest locations, track points, photos, and the optional upload
  outbox. Schema versions and field meanings are compatibility contracts; add a
  new version for schema changes.
- `rideId` is shared across routes, Zustand, REST/realtime, and Dexie. Solo IDs
  keep the `solo-` prefix.
- The device owner's accepted track is stored locally for solo and group rides.
  Upload success must not control local persistence.
- Realtime remains optional: no Echo client is created unless configuration
  enables it and a Pusher key is present.
- GeoJSON/Leaflet data uses `[longitude, latitude]`; React Leaflet positions use
  `[latitude, longitude]`. Convert only at explicit boundaries.
- GPS watches, Capacitor/browser listeners, timers, realtime channels, Leaflet
  resources, and object URLs require cleanup on stop, replacement, or unmount.
- Remote map tiles require network access even when ride data is stored offline.
  Android background GPS, notification permissions, app lifecycle, Filesystem,
  and native Share behavior require device/emulator validation.

## Commands and validation

Commands are defined in `package.json`; repository policy is documented in
`docs/TESTING.md`:

| Purpose | Command |
| --- | --- |
| Development server | `npm.cmd run dev` |
| Production TypeScript check and build | `npm.cmd run build` |
| Unit/component tests (non-watch) | `npm.cmd run test.unit -- --run` |
| Lint | `npm.cmd run lint` |
| Cypress E2E | Start Vite, then `npm.cmd run test.e2e` |
| Capacitor Android sync/build | `npm.cmd run build:android` |
| Android debug build | `npm.cmd run build:android:debug` |

Vite/Vitest configuration is in `vite.config.ts`; tests use jsdom and
`src/setupTests.ts`. Cypress uses `cypress.config.mjs` with base URL
`http://127.0.0.1:5173`. Android/native checks apply to changes involving native
code, plugins, permissions, geolocation, lifecycle, filesystem, or sharing.

## Unknown or externally owned behavior

- REST server validation, authorization, persistence, and response/event guarantees
  cannot be verified here because the backend is not in this repository.
- Physical Android background tracking and native sharing cannot be proven by
  source inspection or browser tests alone.
- `src/api/ride.ts` can return local-storage fallback data or a development mock
  when there is no stored session; a rendered ride summary is not proof that a
  persisted ride exists.
