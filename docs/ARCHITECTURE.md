# RoadTrip Architecture

This document describes the architecture implemented in the repository. It is a
source-of-truth guide, not a claim that every current file already follows every
rule in [CONVENTIONS.md](CONVENTIONS.md).

## Product and runtime

RoadTrip is an offline-capable ride tracker with two operating modes:

- **Group rides** use an external REST API to create or join a ride, Laravel
  Echo/Pusher to receive rider updates, periodic REST calls to publish the current
  rider's location, and the same local filtered track history as solo rides.
- **Solo rides** create a local `solo-*` session, skip backend synchronization,
  and append the full GPS track to IndexedDB for history and replay.

Both modes use the same ride map, timer, stopover, session, history, photo, and
profile concepts. The app runs as a Vite web application and as a Capacitor
Android application.

### Primary stack

| Concern | Technology |
| --- | --- |
| UI and mobile shell | React 19, Ionic React 8, Capacitor 7 |
| Routing | React Router 5 through `@ionic/react-router` |
| Build and typing | Vite 5, TypeScript 5.9 in strict/no-emit mode |
| Shared client state | Zustand 5 |
| Maps | Leaflet and React Leaflet |
| Turn-by-turn navigation | Android Valhalla bridge with online routing and optional downloadable regional tiles |
| Local persistence | Dexie over IndexedDB plus narrowly scoped local storage |
| HTTP | Axios |
| Realtime | Laravel Echo with the Pusher protocol |
| Location | Capacitor Geolocation and community Background Geolocation |
| Tests | Vitest, Testing Library, jsdom, and Cypress |

The Android wrapper compiles against SDK 36, targets SDK 35, and requires a
minimum SDK of 24 because Valhalla Mobile's native library requires Android 7.0.
The Android application ID is `com.github.leoodaya117.roadtrip`, derived from
the repository's GitHub owner and project name. Android permits cleartext traffic
for the local HTTP/WebSocket development defaults. There is no committed iOS
project and no backend implementation in this repository.

## Layers and dependency direction

The intended direction is from UI toward integrations:

```text
App routes
  -> pages
     -> components
     -> hooks
        -> Zustand store
        -> services / read-model API
           -> Capacitor plugins
           -> IndexedDB / localStorage
           -> REST / WebSocket backend
```

- `src/App.tsx` owns the route table and top-level Ionic/Capacitor setup.
- `src/pages/` composes full screens and translates route parameters into domain
  actions. A page may call a service for a page action, but it must not implement
  raw HTTP, Dexie schemas, plugin registration, or WebSocket configuration.
- `src/components/` owns reusable presentation and direct UI interactions. It
  receives typed data/callbacks rather than reaching across unrelated layers.
- `src/hooks/` coordinates stateful behavior with React lifecycles: GPS providers,
  timer persistence, network state, REST synchronization, realtime subscriptions,
  and mock riders.
- `src/store/rideStore.ts` owns transient state shared between pages: current user,
  current ride, riders, topic messages, tracking, and solo mode.
- `src/services/` owns external I/O and adapters: REST, Echo, Dexie, local profile,
  Leaflet icon setup, and foreground/background geolocation.
- `src/api/ride.ts` assembles the history/statistics `Ride` read model from local
  persistence and its development fallbacks. It is not the group REST client.
- `src/types/` owns shared domain and integration contracts.

Keep persistent data out of Zustand. A reload can clear Zustand without losing
the resumable `RideSession`, track, photos, profile, or timer state.

## Routes and page responsibilities

| Route | Page | Responsibility |
| --- | --- | --- |
| `/` | Redirect | Redirects to `/home` |
| `/home` | `HomePage` | Create, join, start solo, resume, and enter history/profile |
| `/ride-lobby/:rideId` | `RideLobbyPage` | Show ride code and participants; host starts the map |
| `/ride-map/:rideId` | `RideMapPage` | Live map, tracking, timer, stopovers, photos, topics, and ride end |
| `/account` | `AccountPage` | Persist rider display name and avatar locally |
| `/ride-history` | `RideHistoryPage` | Paginated solo/group sessions, mini maps, photos, and deletion |
| `/ride-history-stats/:rideId` | `RideHistoryStatsPage` | Route map, derived statistics, gallery, and share entry point |
| `/ride-history-stats/:rideId/share` | `ShareImagePage` | Load a ride and render the share-image generator |
| `/ride-replay/:rideId` | `RideReplayPage` | Replay stored track points and time-positioned photos |

Routing uses React Router v5 APIs (`Route`, `Redirect`, `useHistory`, `useParams`)
inside `IonReactRouter`/`IonRouterOutlet`. Do not introduce v6-only APIs without a
coordinated router migration.

## Core flows

### Create or join a group ride

1. `HomePage` creates a new local user. Profile name/avatar preferences come from
   local storage, while the new runtime user ID is generated locally.
2. `services/api.ts` creates or joins the ride through REST.
3. The response's `rideId`, current rider, and optional rider list populate
   Zustand. A new active `RideSession` is persisted in Dexie.
4. The app enters the lobby. `useRideChannel` subscribes to the private ride
   channel when realtime is configured and updates individual riders in Zustand.
5. The host can navigate to the ride map. The current UI does not broadcast a
   separate "ride started" event; non-host lobby behavior depends on backend or
   future product work not implemented here.

### Start or resume a solo ride

1. `HomePage` generates a `solo-${uuid-or-timestamp}` ride ID, creates an active
   host session with `isSolo=true`, stores it in Dexie, and enters the ride map.
2. The `solo-` prefix is also used as a defensive inference of solo mode on direct
   navigation and inside location synchronization.
3. Each accepted location updates the current rider and live polyline. The sync
   hook saves the latest point and appends it to the ride's `tracks` table.
4. Resuming restores the user/session, prior track, distance, elapsed duration,
   tracking intent, and last known map center from local persistence.

Group resume returns to the lobby; solo resume returns directly to the map. Home
selects the newest non-ended session not hidden by `ride:hidden:<rideId>`.

### Track location and switch providers

`useLocationTracker` obtains singleton foreground/background providers from
`LocationProviderFactory` and exposes one normalized `LocationPoint` stream.

- The foreground provider uses `@capacitor/geolocation`, requests permission,
  obtains a current point, and starts a high-accuracy watch.
- Foreground points are suppressed when both less than 3 seconds and less than
  6 metres from the previously accepted point.
- The background provider registers the community plugin with permission requests,
  no distance filter, and a persistent-notification title/message.
- Both sources pass through one mixed-adaptive filter. It rejects fixes outside
  coordinate, 50 m accuracy, 30-second age, monotonic timestamp, adaptive
  time/distance, and 70 m/s plausibility limits.
- Accepted points carry a stable point ID, tracking segment, and source. Provider
  switches retain the filter baseline; stopover resume resets it for a new segment.
- Background callbacks update `bg_last_location_ts` for diagnostics without
  storing rejected coordinates.
- A Capacitor `appStateChange` listener switches an active ride to the background
  provider when inactive and back to the foreground provider on resume.
- Stopping or switching must unsubscribe listeners and stop the previous watch.

`RideMapPage` treats Zustand's `isTracking` as the desired ride state and the
hook's `isTracking` as the actual GPS watch state. It retries startup while a ride
wants tracking but the watch is unavailable.

Android turn-by-turn navigation is coordinated by `useRideNavigation` from the
accepted location returned by `useLocationTracker`. The native
`OfflineNavigation` Capacitor plugin routes through the hosted Valhalla API by
default and uses a locally cached graph when the rider has downloaded the
optional regional pack. It owns and reuses one local Valhalla actor and uses
native Android text-to-speech. Destination and guidance intent are optional
fields on the local `RideSession`; generated route geometry remains transient
and is recalculated on resume. See [Navigation](OFFLINE_NAVIGATION.md).
Navigation is unavailable on web and does not change the remote basemap behavior.

### Persist and synchronize locations

`useRideLocationSync` has two independent responsibilities:

1. For every accepted point with a ride and rider, atomically save the last known
   location and append the full point to the owner's local track. When feature-
   gated batch sync is enabled for a group ride, enqueue the same point atomically.
2. For an active non-solo ride, publish the newest point every 4 seconds while
   online. While offline, retain a waiting status; when connectivity returns,
   flush the stored last point once.

Realtime is receive-only in this client. `useRideChannel` listens for backend
`RiderLocationUpdated` events and merges the supplied rider into Zustand. Topic
messages/flags currently live only in memory and are not sent through the backend.

The durable outbox is gated by `VITE_ENABLE_LOCATION_BATCH_SYNC`. It flushes up to
50 same-ride/rider points on new data, reconnect, foreground resume, or a 15-second
interval. Explicit acknowledgements delete records; retriable failures use bounded
exponential backoff and permanent validation failures remain diagnosable. Existing
single-location publishing continues during the rollout.

### Pause, resume, and end a ride

- Tracking start starts or resumes `useRideTimer`. Tracking stop pauses it.
- A user pause is a stopover: the current location is appended with
  `event: 'stopover'` and retained as the last known location. The stopover marker
  is stored even for a group ride, although full group tracks are not otherwise
  appended by the sync hook.
- Every 5 seconds while tracking, and once when paused/unmounted, the map updates
  the session's maximum known duration and current distance.
- Timer state persists separately in local storage so it can account for time
  across app background/resume transitions.
- Ending stops GPS, persists `endedAt`, `status='ended'`, final distance and
  duration, hides the ride from Home's resume card, dispatches `ride:ended`, clears
  Zustand ride state, resets the timer, and returns Home.

The history record is retained. Hiding a completed ride only affects resumability.

### History, replay, photos, and sharing

- `RideHistoryPage` pages sessions newest-first, splits solo/group views, lazily
  loads tracks/photos, draws static mini maps, and can delete a session and track.
  Current deletion does not call `deletePhotos`; changes here must consider orphan
  cleanup deliberately.
- `fetchRideById` loads a session, sorted track points, and photos, then constructs
  GeoJSON and derives missing duration, average/max speed, and stopover count. If
  no session exists it reads `ride:<rideId>` from local storage, then creates a
  development mock.
- `RideReplayPage` reads session, tracks, and photos directly from the offline
  service and advances through stored points.
- Photos are stored as full and thumbnail blobs with optional location and note.
  Screens turn blobs into object URLs for display.
- `ShareImageGenerator` draws a configurable bitmap. Web downloads it; native
  builds write through Capacitor Filesystem and invoke Capacitor Share.

Map tiles and any remote imagery still require network access even when ride data
is available offline.

## State and data contracts

### Zustand ride state

`useRideStore` contains:

- `currentUser`, `rideId`, `riders`, and in-memory topic `messages`;
- desired `isTracking` state and `isSoloMode`;
- current topic and rider topic flags;
- actions to set/clear the ride, update riders, and manage messages/topics.

`clearRide` clears the ride ID, riders, tracking, and solo mode. It intentionally
does not erase Dexie history or local profile preferences.

### Shared domain types

`src/types/ride.ts` defines the primary contracts:

- `CurrentUser` and `Rider`;
- `LocationPoint` with ISO timestamp, speed, accuracy, and optional event;
- `RideSession`, the persisted lifecycle summary;
- `ChatMessage` and realtime `RiderLocationEvent`;
- `PhotoRecord` and the history/statistics `Ride` read model.

Use ISO timestamps at boundaries. Speed values are metres per second and distance
values are metres unless a UI formatter explicitly converts them.

### IndexedDB

Database name: `rideTrackerDb`. The current schema is version 5.

| Table | Key/indexes | Purpose |
| --- | --- | --- |
| `sessions` | Primary key `rideId`; index `createdAt` | Lifecycle, user, mode, duration, distance |
| `locations` | Primary key `rideId` | One latest normalized location per ride |
| `tracks` | Auto key `id`; indexes `rideId`, `timestamp`, unique `pointId`, `segmentId` | Filtered owner track and stopovers |
| `photos` | Auto key `id`; indexes `rideId`, `timestamp` | Full/thumbnail blobs and metadata |
| `outbox` | Unique key `pointId`; indexes ride, status, retry time, timestamp | Durable feature-gated group batches |

Schema history is meaningful: v1 created sessions/locations, v2 added tracks, v3
indexed session creation time, v4 added photos, and v5 added point/segment metadata
plus the outbox. The v5 upgrade backfills legacy tracks deterministically. A schema
change requires a new Dexie version and an explicit compatibility/migration decision.

### Local storage

| Key | Owner | Meaning |
| --- | --- | --- |
| `rt_profile_name` | `services/user.ts` | Optional saved display name |
| `rt_profile_avatar` | `services/user.ts` | Optional resized avatar data URL |
| `roadtrip:theme-preference` | `ThemeProvider` | `system`, `light`, or `dark` appearance preference |
| `ride_timer_state_v1` | `useRideTimer` | Elapsed seconds, running state, save timestamp |
| `bg_last_location_ts` | Background provider | Timestamp of latest background point |
| `ride:hidden:<rideId>` | Home/map lifecycle | Suppress an ended ride from resume |
| `ride:<rideId>` | History read-model fallback | Development/sample `Ride` JSON |

Do not add general application state to local storage. Prefer Dexie for structured
or growing data and document every new key.

The browser event `ride:ended` carries `{ rideId }`. Home refreshes resumable
sessions and every mounted timer resets when it receives the event.

## External interfaces

### REST API

Base URL: `VITE_API_URL`, default `http://localhost:8000/api`. Axios uses a
10-second timeout. No token interceptor is configured in this client.

| Request | Client payload | Expected response/use |
| --- | --- | --- |
| `POST /rides` | `{ userId, name }` | `{ rideId, rider, riders? }` |
| `POST /rides/:rideCode/join` | `{ userId, name }` | `{ rideId, rider, riders? }` |
| `POST /rides/:rideId/location` | `{ riderId, lat, lng, speed }` | Success body is ignored |
| `POST /rides/:rideId/locations/batch` | `{ riderId, points[] }` with point ID, timestamp, coordinates, speed, accuracy, source | Explicit accepted IDs and rejected point reasons |

These shapes are client expectations, not a backend specification. Coordinate any
contract change with the separately maintained backend.

### Realtime

- Protocol/client: Laravel Echo using Pusher.
- Subscription: private channel `ride.<rideId>`.
- Event: `RiderLocationUpdated`.
- Payload: `{ rider: Rider }`.
- Cleanup: stop the event listener and leave the ride channel on unmount/change.

Realtime initializes only when configuration enables it and a non-empty key is
present. Initialization assigns `Pusher` to `window.Pusher`, as required by Echo.

### Environment variables

| Variable | Default/behavior |
| --- | --- |
| `VITE_API_URL` | `http://localhost:8000/api` |
| `VITE_PUSHER_KEY` | Empty; required to initialize realtime |
| `VITE_PUSHER_CLUSTER` | `mt1` |
| `VITE_PUSHER_HOST` | `localhost` |
| `VITE_PUSHER_PORT` | `6001` |
| `VITE_PUSHER_FORCE_TLS` | String `true` enables TLS; otherwise false |
| `VITE_PUSHER_AUTH_ENDPOINT` | Derived from API origin plus `/broadcasting/auth` |
| `VITE_ENABLE_REALTIME` | If set, only string `true` enables; if unset, a key enables |
| `VITE_ENABLE_LOCATION_BATCH_SYNC` | Default `false`; enable only after the idempotent batch backend is deployed |

Vite exposes all of these to the browser. Values may identify public endpoints or
public Pusher application settings, but must not contain private credentials.

## Native boundary

Capacitor integrations include app state, status bar, foreground/background
geolocation, filesystem, and sharing. Keep plugin calls behind services/hooks or a
focused native boundary, check web behavior, and clean every listener/watch.

Android permissions for internet, fine/coarse/background location, foreground
service, notifications, and wake lock are declared in `AndroidManifest.xml`. Read
[BACKGROUND_GEO_SETUP.md](BACKGROUND_GEO_SETUP.md) before changing location setup.
Capacitor uses the background plugin's required legacy bridge, and Android 13+
notification permission is requested before the background watcher starts.
Run Capacitor sync after plugin or native configuration changes and verify behavior
on a real device; browser success cannot validate background tracking.
