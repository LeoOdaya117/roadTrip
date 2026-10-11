# Hybrid Navigation

On Android, RoadTrip routes through the hosted Valhalla API by default. If a
rider downloads the optional CALABARZON and Metro Manila routing pack, the app
uses that local graph where it covers the requested route and falls back to the
online API for other areas. GPS tracking, route progress, and maneuver prompts
remain in the app. The public routing request sends the current route endpoints
to the configured Valhalla service; off-route fixes are sent when calculating a
reroute.

The default endpoint is the FOSSGIS Valhalla demo at
`https://valhalla1.openstreetmap.de/route`, which has global graph coverage and
supports motorcycle costing. It is a fair-use demo, not a service guarantee.
Valhalla asks apps distributed to end users to identify themselves with an
`X-Client-Id` header and notify the maintainers before publication. The native
bridge sends the RoadTrip repository as that identifier. Set
`VITE_NAVIGATION_ROUTING_URL` to a different compatible HTTPS Valhalla endpoint
when the app has an approved production service. Do not put private API keys in
`VITE_*` values.

The optional offline pack is hosted as the public GitHub Release asset
`offline-routing-calabarzon-v1/valhalla_tiles.tar`. It is 237,465,600 bytes
(about 227 MiB) and is downloaded only when the rider requests it. SHA-256 is
checked before the file is made available to Valhalla. Its graph was built with
Valhalla 3.9.1 from Geofabrik's Philippines OpenStreetMap PBF updated at
`2026-10-06T20:21:06Z`, using the rectangular bounds `119.8,12.3,123.0,15.5`
(longitude/latitude). This regional pack is not a nationwide offline graph.
The route line and voice prompts can continue offline after a route is
calculated, but a new off-route calculation outside installed tile coverage
requires the online API. The Leaflet basemap remains remote, so routing tiles do
not make map imagery available offline.

The OSM attribution and license notice is
`android/app/src/main/assets/OSM_DATA_LICENSE.txt`; the ride guidance UI also
shows OpenStreetMap attribution. The routing pack is no longer included in the
checked-out source tree or APK; this change removes the tile asset and Git LFS
tracking from the branch.

## Rebuilding the optional offline pack

Build an extract from an OpenStreetMap PBF that covers the complete pilot area.
The current bundle was clipped from the Philippines PBF with this Osmium
command (replace the input with the desired dated Geofabrik download when
refreshing the data):

```bash
osmium extract \
  --bbox=119.8,12.3,123.0,15.5 \
  --strategy=complete_ways --set-bounds \
  --output=calabarzon-metro-manila.osm.pbf \
  philippines-latest.osm.pbf
```

Use the Valhalla build tools matching the Valhalla Mobile library's data format:

```bash
mkdir -p valhalla_tiles
valhalla_build_config \
  --mjolnir-tile-dir "$PWD/valhalla_tiles" \
  --mjolnir-tile-extract "$PWD/valhalla_tiles.tar" \
  --mjolnir-timezone "$PWD/valhalla_tiles/timezones.sqlite" \
  --mjolnir-admin "$PWD/valhalla_tiles/admins.sqlite" > valhalla.json
valhalla_build_timezones > valhalla_tiles/timezones.sqlite
valhalla_build_admins -c valhalla.json calabarzon-metro-manila.osm.pbf
valhalla_build_tiles -c valhalla.json calabarzon-metro-manila.osm.pbf
valhalla_build_extract -c valhalla.json -v
```

The release archive was smoke-tested with Valhalla 3.9.1 for motorcycle routes
from Manila to Tagaytay (59.0 km) and Manila to Lucena (138.7 km). Test additional
destinations near the pilot envelope edges after changing the source data. Do
not commit a placeholder or an extract for a different region under the expected
filename.

OpenStreetMap data is licensed under the Open Database License. Keep visible
attribution to OpenStreetMap contributors in the navigation UI and include the
required attribution and license notice with distributed builds. Valhalla
Mobile's Android artifact and model dependencies are declared in
`android/app/build.gradle`.

## Runtime behavior

- The Capacitor `OfflineNavigation` plugin reuses one Valhalla actor for local
  routes. Online requests also run away from the Android main thread.
- A local graph is optional. The first online route works without downloading
  it; the rider can download the regional pack from the navigation panel for
  offline routing in its coverage area.
- Navigation consumes only points accepted by `useLocationTracker`; it does not
  register another location watcher.
- The destination and whether guidance is enabled are stored with the local ride
  session. A resumed active ride restores navigation intent and recalculates its
  route from the current accepted location. The generated route itself is not
  persisted.
- Three consecutive accepted fixes beyond `max(40 m, 2 × accuracy)` trigger one
  reroute. Pausing stops spoken prompts; resuming recalculates from the next
  accepted fix. Ending a ride releases guidance and speech.
- Photon place search covers the Philippines, is debounced in the UI, cached
  briefly, and attributed. Map-tap selection does not require network.
- Photon’s public demo has no availability guarantee and may throttle extensive
  usage. Review its current terms and usage before a broad public rollout.
- The FOSSGIS Valhalla demo follows fair-use limits and has no availability
  guarantee. Its maintainers request notice before end-user app distribution;
  use a compatible hosted endpoint with an explicit service agreement for a
  production launch if those limits or terms are unsuitable.
- Turn prompts use Android text-to-speech in English. Verify route progress and
  speech with the screen locked on a physical Android device before release.
- Valhalla Mobile 0.6.3 requires Android compile SDK 36 and minimum SDK 24. The
  app currently targets SDK 35. The Android Gradle Plugin is 8.10.1, compatible
  with the committed Gradle 8.11.1 wrapper.
