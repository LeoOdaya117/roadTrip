# Verified Conventions

Verified from `AGENTS.md`, `docs/CONVENTIONS.md`, and source on 2026-10-10.
`PROJECT_NOTES.md` contains the concise working rules and known documentation
discrepancies.

- Keep dependency direction: pages compose, hooks coordinate, Zustand owns
  transient shared state, services own I/O, and `src/types/` owns shared
  contracts. Persistent ride data belongs in Dexie, not Zustand.
- Preserve cross-layer `rideId` meaning and the `solo-` prefix. Keep group and
  solo behavior distinct; local track persistence must not depend on upload.
- Preserve location-filter continuity across providers and start a new segment
  after a stopover. Keep GeoJSON `[longitude, latitude]` and React Leaflet
  `[latitude, longitude]` conversions explicit.
- Add schema changes as a new Dexie version. Clean up watches, timers, listeners,
  realtime channels, map resources, and object URLs on stop or unmount.
- Feature-detect Capacitor APIs and mock native behavior in browser tests. Use
  semantic, accessible controls and the existing Ionic theme tokens.
- Treat `VITE_*` values as public client configuration. The backend is external;
  do not infer server-side guarantees from client code.
