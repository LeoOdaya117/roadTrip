# RoadTrip Testing and Validation

RoadTrip uses a strict all-green completion policy. Lint, unit tests, production
build/typecheck, and Cypress E2E must pass before an implementation change is
declared complete. Relevant native checks are additional requirements, not
replacements. A failure that existed before the change is a blocker to repair or
explicitly escalate; it is not an automatic waiver.

This policy is intentionally stricter than the current repository baseline. See
[Known baseline blockers](#known-baseline-blockers) before starting work.

## Required validation sequence

Run from the repository root with the committed lockfile dependencies installed.

### 1. Lint

```bash
npm run lint
```

```powershell
npm.cmd run lint
```

Lint must finish with no errors or warnings. Do not use `--fix` without reviewing
the diff, and do not solve failures by globally disabling rules. Generated Android
build output must be excluded at configuration level rather than hand-edited.

### 2. Unit and component tests

Use non-watch mode for validation and automation:

```bash
npm run test.unit -- --run
```

```powershell
npm.cmd run test.unit -- --run
```

During development, `npm run test.unit` starts Vitest's watch mode. Tests run in
jsdom with globals enabled and `src/setupTests.ts` loaded.

### 3. Production build and TypeScript

```bash
npm run build
```

```powershell
npm.cmd run build
```

The build runs `tsc` before `vite build`; a successful bundle therefore includes
the repository's strict TypeScript check. Treat Vite/CSS/bundle warnings as work to
resolve under the all-green policy, even when the process exits successfully.

### 4. Cypress E2E

Cypress is configured with `baseUrl: http://localhost:5173`. Start Vite in one
terminal and leave it running:

```bash
npm run dev
```

Then run Cypress in a second terminal:

```bash
npm run test.e2e
```

Windows PowerShell equivalents:

```powershell
npm.cmd run dev
```

```powershell
npm.cmd run test.e2e
```

The committed command uses headless `cypress run`. It must launch successfully and
all specs must pass. An executable/cache permission failure is an environment
blocker to repair; it does not count as an E2E pass.

### 5. Native checks when relevant

Run these when changing Capacitor dependencies/configuration, Android source,
permissions, geolocation, app lifecycle, filesystem, sharing, or status-bar code:

```bash
npm run build:android
npm run build:android:debug
```

On Windows use `npm.cmd`. For direct Gradle unit checks on Windows:

```powershell
.\android\gradlew.bat test
```

Use `connectedAndroidTest` only with a prepared emulator/device. Location and app
lifecycle work also requires the manual device scenarios below. Read
[BACKGROUND_GEO_SETUP.md](BACKGROUND_GEO_SETUP.md) for permission setup.

## Test organization

- Place unit/component tests beside the source as `*.test.ts` or `*.test.tsx`.
- Place user-flow browser tests in `cypress/e2e/` as behavior-named `*.cy.ts` files.
- Put reusable Cypress commands in `cypress/support/commands.ts`; do not hide the
  behavior under test in opaque helper layers.
- Test observable outcomes and public module behavior. Avoid assertions against
  hook implementation details, internal state field ordering, or generated CSS.
- Every bug fix needs a regression test that fails for the reported behavior before
  the fix whenever the layer can be automated.
- Update tests when an intentional contract changes; never weaken an assertion only
  to make a red suite green.

## What to test by layer

### Pure/domain logic

Extract calculation and conversion code when it can be tested without rendering.
Cover:

- duration, speed, distance, and stopover derivation;
- foreground jitter thresholds and coordinate order conversions;
- lifecycle transitions and resume eligibility;
- malformed/missing timestamps, empty tracks, null speed, and invalid stored data.

Use exact boundary cases and deterministic clocks/locations.

### React hooks

Render through a small test component or a hook-testing pattern supported by the
installed Testing Library. Use fake timers for polling, persistence, retry, timer,
and replay behavior. Always assert cleanup after unmount or dependency change.

Mock at the service/provider boundary:

- `ILocationProvider` for foreground/background switching and errors;
- `services/api.ts` for online/offline sync and overlapping sends;
- `services/realtime.ts` for subscribe, event merge, stop-listening, and leave;
- Capacitor `App` for background/resume transitions;
- browser online/offline events for `useNetworkStatus`.

Advance fake timers deliberately and restore real timers after each test.

### Services and persistence

- REST tests should assert paths, payloads, timeout/error normalization, and optional
  response fields without contacting a real backend.
- Realtime tests should cover empty key, explicit enable/disable, configured Echo,
  channel naming, event payload, singleton reuse, and cleanup.
- Persistence tests need an isolated IndexedDB implementation/database. Clear it
  between tests and cover fresh v4 creation, upgrades from earlier schemas, sorting,
  paging, multi-table deletion, blobs, and error propagation.
- Local-storage tests must clear only test-owned keys and cover missing, malformed,
  quota/error, save, and removal paths.

Do not share a mutable database, store, environment object, clock, or Echo singleton
between tests without resetting modules/state.

### Components and pages

Use Testing Library queries by role, label, and visible text. Cover loading, empty,
success, failure, disabled, permission-denied, offline, and direct-route states.

Mock integrations that jsdom cannot implement reliably:

- Capacitor plugins and permission prompts;
- Leaflet map/container methods and browser layout APIs;
- `URL.createObjectURL`/`URL.revokeObjectURL`;
- image loading, canvas, downloads, filesystem, and native Share;
- `matchMedia`, ResizeObserver, and other missing browser APIs as needed.

Do not test a map by asserting Leaflet's private DOM. Assert the coordinates,
markers, bounds request, overlays, and callbacks supplied by RoadTrip code.

### Cypress user flows

E2E specs must describe RoadTrip behavior, not Ionic starter content. Stub external
REST and realtime dependencies for deterministic web runs unless a separately
configured integration environment is explicitly in scope.

At minimum, the browser suite should grow to cover:

- Home renders and navigation works after the root redirect;
- group create/join success and backend failure;
- solo start, pause/stopover, resume, end, and resume-card removal;
- profile name/avatar persistence;
- history solo/group filters, stats, replay, share entry, and deletion;
- offline and realtime-disabled behavior;
- keyboard-accessible primary controls and narrow viewport layouts.

Never allow Cypress to request real location or native permissions in CI. Stub the
location/provider boundary with stable coordinates and timestamps.

## Change-to-test matrix

| Changed area | Minimum automated coverage | Additional validation |
| --- | --- | --- |
| Routes or page navigation | Component route test and affected Cypress flow | Direct URL, back button, refresh |
| Ride create/join API | REST service tests and Home action tests | Stubbed Cypress success/failure |
| Zustand ride state | Store action/selector tests and affected page tests | Verify `clearRide` invariants |
| Ride lifecycle/timer | Fake-timer hook tests and solo E2E | Background/resume and legacy session |
| Foreground location | Provider/hook tests for permission, jitter, cleanup | Browser fallback and device GPS |
| Background location | Provider/app-state tests | Real Android lock/background test |
| Coordinate filter | Every accuracy/time/speed band boundary, noise floor, provider switch, segment reset | Poor GPS, tunnel, stationary drift |
| Location REST sync | Interval, offline, reconnect, overlap tests | Stubbed request cadence in E2E |
| Batch location outbox | Flag off/on, 50-point cap, partial acknowledgement, retry/auth/permanent policy, restart recovery | Backend deduplication and reconnect delivery |
| Realtime | Configuration, event, channel cleanup tests | Disabled and configured manual modes |
| Dexie schema/queries | Fresh DB, upgrade, CRUD, ordering tests | Existing-device data retained |
| History/stats/replay | Empty/full/error tests and Cypress navigation | Long/short/one-point tracks |
| Photos/share image | Blob URL cleanup and web/native branch tests | Download plus Android share |
| Map rendering | Coordinate/bounds/overlay component tests | Touch, resize, offline tiles |
| Styling/accessibility | Role/label tests and affected E2E | Phone/desktop, focus, contrast |
| Native configuration | Web build plus Android Gradle checks | Emulator and physical device |
| Documentation only | Link/path/command verification | Confirm no product files changed |

Changes with cross-layer behavior need the union of the applicable rows.

## Manual device scenarios

For location/lifecycle releases, use a real Android device where possible:

1. Fresh install: deny, then grant fine/coarse location and verify useful recovery.
2. Start solo: confirm current marker, path, distance, and timer update.
3. Lock/background the device: confirm the persistent notification and location
   records continue for several minutes.
4. Resume: confirm only one foreground watch is active and no timer double-counts.
5. Pause at a stopover: confirm GPS stops, timer pauses, and one stopover persists.
6. Resume and end: confirm final stats persist and Home offers no resume card.
7. Kill/relaunch during an active ride: confirm the session, timer, last position,
   and solo path recover coherently.
8. Toggle network during a group ride: confirm local retention and reconnect flush.
9. Capture a photo and share: confirm thumbnail/full image, location/note, native
   filesystem write, share sheet, and no broken object URLs.

Record device model, Android version, permission state, network state, and relevant
logs when reporting a native failure.

## Validated baseline

Validated on **August 9, 2026** in the Windows workspace after the background
tracking hardening work:

- `npm.cmd run lint` passes without source or generated-output findings.
- `npm.cmd run test.unit -- --run` passes the filter, schema migration,
  transactional persistence, outbox policy, provider, realtime, and application
  suites. Record the current test count from the command output in the completion
  report rather than hard-coding it here.
- `npm.cmd run build` passes TypeScript and Vite production bundling without the
  previous CSS import-order, stale Browserslist, or oversized-chunk warnings.
- `npm.cmd run test.e2e` passes the RoadTrip home-to-history Cypress flow when a
  Vite server is running. On sandboxed Windows agents the cached Cypress executable
  may require an approved external run because it lives below the user profile.
- Capacitor Android sync, `gradlew.bat testDebugUnitTest`, and
  `gradlew.bat assembleDebug` pass after syncing the Local Notifications plugin.

The Gradle Android plugin still reports its standard `flatDir` repository advisory,
and the Local Notifications dependency emits a Java deprecation note. These come
from Capacitor-generated/plugin build files, not application source failures.
Physical-device background scenarios remain mandatory for a release candidate and
must be reported as not run when no device or emulator is attached.

## Completion report

When handing off a change, state:

- each command run and whether it passed;
- test counts or the most relevant scenarios added;
- native device/emulator coverage, if applicable;
- any warning or failure with exact reproduction details;
- anything not run and the concrete blocker.

Do not say "tests pass" when only unit tests ran, or when a command exited zero but
its tool reported an executable/verification failure in the output.
