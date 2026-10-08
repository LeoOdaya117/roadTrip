# Offline Navigation

RoadTrip's Android navigation bridge uses Valhalla Mobile to calculate a
motorcycle route from a bundled routing graph. Search uses the public Photon
demo while online. A destination can also be selected by tapping the map. The
Leaflet basemap remains remote, so offline route calculation does not make map
imagery available offline.

The Android app includes a CALABARZON and Metro Manila pilot extract at the
required asset path below. The current graph was built with Valhalla 3.9.1 from
the Geofabrik Philippines OSM PBF updated at `2026-10-06T20:21:06Z`, clipped
with Osmium complete-way extraction to the pilot envelope
`119.8,12.3,123.0,15.5` (longitude/latitude). This is a rectangular envelope,
so the tiles also include roads in neighboring provinces and do not represent a
precise regional boundary.

The generated `valhalla_tiles.tar` is 237,465,600 bytes. In the Android debug
APK, the asset compresses to 95,867,263 bytes; the full universal debug APK is
138,515,764 bytes (about 132 MiB). This is a measured debug build size, not a
release AAB size. The shipped OSM attribution and license notice is
`android/app/src/main/assets/OSM_DATA_LICENSE.txt`; the ride guidance UI also
shows OpenStreetMap attribution.

## Required routing data

The native bridge expects a Valhalla tile extract at:

```text
android/app/src/main/assets/valhalla_tiles.tar
```

The archive is bundled at that path. Rebuild it when the pilot coverage or
source map data changes, and keep the data timestamp and packaged size in this
document and the license notice.

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

The bundled archive was smoke-tested with Valhalla 3.9.1 for motorcycle routes
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

- The Capacitor `OfflineNavigation` plugin owns one Valhalla actor and reuses it
  for route requests. Route calls run away from the Android main thread.
- Navigation consumes only points accepted by `useLocationTracker`; it does not
  register another location watcher.
- The destination and whether guidance is enabled are stored with the local ride
  session. A resumed active ride restores navigation intent and recalculates its
  route from the current accepted location. The generated route itself is not
  persisted.
- Three consecutive accepted fixes beyond `max(40 m, 2 × accuracy)` trigger one
  reroute. Pausing stops spoken prompts; resuming recalculates from the next
  accepted fix. Ending a ride releases guidance and speech.
- Photon place search is limited to the pilot bounding box, debounced in the UI,
  cached briefly, and attributed. Map-tap selection does not require network.
- Photon’s public demo has no availability guarantee and may throttle extensive
  usage. Review its current terms and usage before a broad public rollout.
- Turn prompts use Android text-to-speech in English. Verify route progress and
  speech with the screen locked on a physical Android device before release.
- Valhalla Mobile 0.6.3 requires Android compile SDK 36 and minimum SDK 24. The
  app currently targets SDK 35. The Android Gradle Plugin is 8.10.1, compatible
  with the committed Gradle 8.11.1 wrapper.
