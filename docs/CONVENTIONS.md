# RoadTrip Conventions

These conventions are prescriptive for new and changed code. Existing violations
are technical debt, not examples to copy. Keep fixes focused on the requested flow,
except when additional repair is required to satisfy the strict all-green gates in
[TESTING.md](TESTING.md).

## General change discipline

- Understand the complete user flow before editing. Ride lifecycle behavior spans
  routes, Zustand, hooks, services, IndexedDB, local storage, and native plugins.
- Make the smallest coherent change. Avoid unrelated renames, formatting sweeps,
  dependency upgrades, or architectural rewrites.
- Preserve unrelated work in a dirty worktree and do not edit generated output.
- Update [ARCHITECTURE.md](ARCHITECTURE.md), this guide, setup documentation, or
  tests when a contract, command, schema, route, permission, or invariant changes.
- Never commit credentials, `.env.local`, production data, generated `dist/`,
  `node_modules/`, Android build output, or device-specific IDE state.

## TypeScript

The repository uses strict TypeScript, ES modules, and no emit during typechecking.

- Prefer explicit domain types at module boundaries and inferred types for simple
  local values. Put reusable contracts in `src/types/`.
- Use `import type` when an import is used only by the type system.
- Do not introduce `any`. Narrow `unknown`, define a minimal integration type, or
  isolate an unavoidable third-party escape hatch with a reason.
- Do not use `@ts-ignore`. Use correct types; if a temporary compiler suppression
  is unavoidable, use `@ts-expect-error` with a specific explanation and test.
- Avoid non-null assertions unless the invariant is immediate and evident.
- Use discriminated unions for lifecycle states rather than loosely related
  booleans when adding a new state machine.
- Use metres, metres per second, and ISO timestamps in domain/persistence layers.
  Convert to display units only at the UI boundary.
- GeoJSON coordinates are `[lng, lat]`; Leaflet display coordinates are
  `[lat, lng]`. Name conversions and test them.
- Use single quotes, semicolons, two-space indentation, and trailing commas in
  multiline literals. Match the surrounding file without reformatting unrelated
  code; no Prettier configuration currently defines an automated format.

## React and Ionic

- Use function components and hooks. Page components use `PascalCasePage.tsx`;
  reusable components use `PascalCase.tsx`; hooks use `useCamelCase.ts`.
- A routed Ionic screen must use `IonPage` as its root and normally provide
  `IonHeader`/`IonToolbar` and `IonContent`. Preserve safe-area and native
  navigation behavior.
- Keep rendering pure. Perform storage, network, timers, plugin calls, Leaflet
  mutation, and subscriptions in actions or effects.
- Give effects complete dependency lists. Stabilize callbacks/objects when their
  identity controls a subscription; do not silence hook warnings by default.
- Every effect that allocates a listener, interval, timeout, geolocation watch,
  Echo channel, object URL, or imperative map resource must release it.
- Use refs for mutable integration handles and freshest callback data, not as a
  second untracked state store.
- Keep page components focused on orchestration. Extract reusable presentation to
  `src/components/` and reusable lifecycle logic to `src/hooks/`.
- Preserve React Router v5 APIs. Use `useHistory`, `useParams`, `Route`, and
  `Redirect` until the router is migrated as one coordinated change.
- Use Ionic navigation semantics and `IonBackButton` defaults that lead to a valid
  page after refresh/direct navigation.
- Type DOM/Ionic event handlers. Do not use `any` merely because Ionic exposes a
  custom event; define or import the required event detail.

## State ownership

Choose the narrowest correct owner:

1. **Local component state** for visual state used by one mounted subtree.
2. **Zustand** for transient ride state shared across pages/components, such as the
   current user, ride, riders, tracking intent, and in-memory topics.
3. **Dexie** for durable structured ride sessions, locations, tracks, and photos.
4. **Local storage** only for small, explicitly documented preferences, recovery
   markers, or compatibility fallbacks.
5. **Backend** for shared group state and other multi-user authority.

- Select the smallest Zustand slice needed by a component. Use store actions
  rather than mutating retrieved objects.
- `clearRide` is transient cleanup, not data deletion. Use explicit persistence
  service functions for destructive history operations.
- Never access raw Dexie tables outside `services/offlineDb.ts`. Add typed service
  operations and keep transactions close to the schema.
- Do not mirror the same persistent value into multiple stores without defining
  which copy is authoritative and how reconciliation works.
- Treat the `solo-` ride prefix, lifecycle `status`, `endedAt`, and hidden marker as
  compatibility contracts. New lifecycle states require end-to-end handling.

## Hooks and services

- Hooks coordinate React lifecycle with typed services; services must not depend on
  React or page components.
- Put HTTP and error normalization in `src/services/api.ts`. Pages should consume
  domain-oriented functions, not construct Axios requests.
- Keep realtime construction and channel cleanup in the realtime service/hook.
  Reuse one configured Echo instance rather than creating sockets per component.
- Implement location sources through `ILocationProvider`. Normalize plugin-specific
  coordinates/errors before emitting `LocationPoint`.
- Keep foreground/background switching in the tracking hook. A page controls ride
  intent but must not register a second competing geolocation watch.
- Avoid overlapping async operations. Use refs, cancellation flags, or abort
  support where repeated effects/actions can race.
- Errors that block user action must become user-visible state. Log diagnostic
  context without personal data, full image contents, or secrets.
- Do not silently swallow an unexpected error. A deliberately best-effort cleanup
  may ignore failure only when correctness is unaffected and the intent is clear.
- Use `console.debug` for development diagnostics and `console.warn`/`console.error`
  for actionable failures. Remove high-frequency or payload-heavy logging before
  completion.

## Persistence and migrations

- Add a new sequential Dexie version for schema/index changes. Never modify the
  meaning of an already released schema version.
- Define the table property and record type when adding a table; avoid untyped
  `rideDb.table(...)` access in new code.
- Design upgrades for existing v1-v4 users and test both a fresh database and an
  upgraded database with retained sessions/tracks/photos.
- Keep session updates monotonic where appropriate: ending must not erase duration,
  distance, mode, user, or creation time.
- Use a transaction for multi-table operations that must succeed or fail together,
  such as deleting a session and all owned data.
- Store blobs in IndexedDB, not local storage. Resize image inputs and revoke every
  `URL.createObjectURL` when it is replaced or the owner unmounts.
- Prefix and document new local-storage keys. Parse defensively, handle quota and
  privacy modes, and provide a removal/migration path.
- Do not persist Leaflet objects, plugin handles, browser events, or Zustand action
  functions.

## REST, realtime, and configuration

- Treat interfaces documented in [ARCHITECTURE.md](ARCHITECTURE.md) as contracts.
  Change client types, integration code, tests, environment documentation, and
  backend coordination together.
- Keep Axios response/error handling typed. Do not leak raw Axios errors into UI.
- Realtime must remain an optional enhancement. The app must not construct Echo
  without both configuration permission and a Pusher key.
- Always stop listening and leave a prior ride channel when `rideId` changes or the
  subscriber unmounts.
- Read environment variables only at a configuration/integration boundary. Supply
  safe local defaults where the product intentionally supports them.
- Browser-exposed `VITE_*` variables are public. Never put an API secret, Pusher
  secret, private key, or privileged token in them.
- The backend is external. Do not claim server validation, authentication, event
  broadcasting, or persistence exists unless its contract is supplied separately.

## Native and browser compatibility

- Use `Capacitor.isNativePlatform()` or a focused capability check before behavior
  that exists only on a native platform. Provide a useful web fallback.
- Mock Capacitor plugins in unit tests. Browser tests must not prompt for real GPS,
  filesystem, share, notification, or background permissions.
- Clean `PluginListenerHandle`, foreground/background watchers, and heartbeat
  intervals on every stop, switch, failure, and unmount path.
- Run `npx cap sync android` (normally through the package scripts) after plugin or
  Capacitor configuration changes.
- Treat `android/app/src/main/AndroidManifest.xml` and intentional Gradle/resource
  files as source. Treat `android/app/build/`, generated Capacitor files, and copied
  web assets as output.
- Permission/configuration changes require device testing. Android background
  restrictions, notification permission, and WebView network throttling cannot be
  proven in jsdom or desktop Chrome.
- No iOS project is committed. If adding one, document platform setup, permission
  strings, background modes, build commands, and validation explicitly.

## Maps, photos, and share rendering

- Keep common Leaflet icon setup in `services/leafletConfig.ts` and avoid global
  configuration spread across pages.
- Tile-layer attribution and provider terms must be preserved. Do not embed private
  map keys in source.
- Invalidate Leaflet size after its container becomes visible or changes size;
  fit bounds only when valid route points exist.
- Separate live-map components from history/read-only map components when their
  interaction contracts differ. Share coordinate helpers rather than copy them.
- Guard canvas/image loading against CORS and decode failures. Preserve web download
  and Capacitor Filesystem/Share paths when changing generated images.
- Image controls need labels/accessible names and must work on touch-sized screens.

## Styling and accessibility

- Use Ionic variables and the design tokens in `src/theme/variables.css` for brand
  colors and app surfaces. Do not scatter a replacement palette across inline CSS.
- Put reusable/page styles in `src/styles/` and import them from the owning entry
  point. Reserve inline styles for genuinely computed values.
- Keep CSS `@import` statements before normal rules; the current build reports an
  import-order warning that new work must not repeat.
- Design mobile-first and verify narrow phone, large phone, and desktop/web layouts.
- Use semantic controls. Interactive `div` elements require correct keyboard,
  focus, and ARIA behavior; prefer buttons/links where possible.
- Provide visible focus, sufficient contrast, meaningful alternate text, and
  status/error text that is not communicated only by color.
- Respect Ionic safe areas and avoid placing essential controls beneath native
  status/navigation bars.

## Naming and placement

| Artifact | Convention | Location |
| --- | --- | --- |
| Routed page | `PascalCasePage.tsx` | `src/pages/` |
| Reusable component | `PascalCase.tsx` | `src/components/` or a focused subfolder |
| Hook | `useCamelCase.ts` | `src/hooks/` |
| Integration/domain service | Descriptive `camelCase.ts` or provider class | `src/services/` |
| Shared store | `<domain>Store.ts` | `src/store/` |
| Shared types | Domain-named `.ts`; integration augmentation `.d.ts` | `src/types/` |
| Unit test | `<module>.test.ts` or `.test.tsx` beside the module | Beside source |
| Browser E2E | Behavior-named `.cy.ts` | `cypress/e2e/` |
| Page/component CSS | Descriptive `.css` | `src/styles/` |
| Contributor documentation | Uppercase descriptive `.md` | `docs/` |

Do not create a new folder or abstraction for one trivial use. Introduce structure
when it expresses a stable responsibility or removes meaningful duplication.

