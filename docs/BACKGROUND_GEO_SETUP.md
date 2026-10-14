# Background Geolocation — Installation & Native Setup

RoadTrip uses `@capacitor-community/background-geolocation` for inactive-screen
tracking and `@capacitor/local-notifications` for the Android foreground-service
notification permission. Both are committed dependencies.

## Install and sync

From the project root:

```bash
npm ci
npx cap sync android
```

Run Capacitor sync after changing either plugin or native configuration.

## iOS configuration

No iOS project is currently committed. If one is added, its `Info.plist` needs:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need to track your location</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>We need to track your location while your device is locked.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

Verify the plugin is included by CocoaPods or Swift Package Manager after sync.

## Android configuration

The app and plugin manifests provide fine/coarse location, background location,
foreground service/location, notification, internet, and wake-lock permissions.
Do not remove them without testing the merged manifest on every supported SDK.

`capacitor.config.ts` sets `android.useLegacyBridge=true`, as required by the
installed background plugin to prevent updates stopping after several minutes.

On first Android launch, RoadTrip automatically requests foreground
location, notifications, and background location before mounting ride screens.
Completed or skipped setup is remembered in `roadtrip:permission-setup-v1`;
Account offers an explicit retry. Setup does not start a GPS watcher. If device location is off, RoadTrip opens Android location settings and rechecks it after return. A compact recovery action appears only when setup cannot finish.
Ride startup rechecks permissions and starts the background-capable watcher
while RoadTrip is active. Android 10 uses its runtime background-location
permission. Android 11+ shows a short explanation and opens app settings, where
the user can choose Location → Allow all the time. If the user skips either
permission, foreground tracking remains available and the app reports that
background tracking is unavailable. The background watcher must not open
permission prompts or settings from an inactive app-state callback.

Optional notification resources in `strings.xml` are:

```xml
<string name="capacitor_background_geolocation_notification_channel_name">Background Tracking</string>
<string name="capacitor_background_geolocation_notification_icon">mipmap/ic_launcher</string>
<string name="capacitor_background_geolocation_notification_color">#FFEB3B</string>
```

## Runtime behavior

- Foreground permission state comes from Capacitor Geolocation.
- The Android background-location bridge checks `ACCESS_BACKGROUND_LOCATION`;
  the background plugin itself requests only coarse/fine location. The ride
  flow prepares background permissions while active, then the background
  provider verifies permission state before registering a watcher. On Android,
  that single background-capable watcher stays active across screen lock and
  foreground resume instead of starting a foreground service after locking.
- Foreground and background fixes pass through the same mixed-adaptive accuracy,
  time, distance, and speed filter. Rejected coordinates are not persisted.
- Native background callbacks use a 5 m distance filter and reject stale fixes.
- Provider switching retains the current filter baseline; a stopover resume starts
  a new segment instead.
- Accepted points are queued directly from the tracker callback for transactional
  IndexedDB persistence. React rendering and network upload do not control this
  queue. Pause/end stop acquisition and drain accepted points before saving
  lifecycle changes; failed writes remain queued for retry.
- A tracking notification indicates the service exists; verify saved coordinates
  independently. Stationary/noisy fixes can be rejected by the quality filter.
  The installed plugin does not support continued tracking after force-stop or
  removal of the app process; resume the saved ride after relaunch.

## Device validation

After sync, build and run on a real Android device or prepared emulator:

1. Test precise-location grant, approximate grant, denial, and later recovery.
2. Test Android 10 background-location permission, and Android 11+ app-settings
   grant/skip/recovery. Skipping must keep foreground tracking usable.
3. On Android 13+, test notification grant and denial independently; denial
   must not create a background watcher or repeatedly prompt while the ride is
   active.
4. Start a ride, turn the screen off for at least 15 minutes, and verify accepted
   points continue to appear in IndexedDB and the foreground notification remains.
5. Separately minimize RoadTrip for at least 15 minutes during an active ride.
   Verify accepted points continue to appear in IndexedDB and the notification
   remains visible.
6. Resume the app and confirm the same Android background-capable watch remains
   active without registering a second watch.
7. Lose network connectivity and confirm local track persistence continues; when
   batch sync is enabled, verify its durable queue flushes after reconnect/resume.
8. Pause at a stopover, move the device, resume, and verify the paused movement is
   not included in route distance.
9. Kill and relaunch during an active ride and verify session/track recovery.

For each Android run, record the device model, Android version, ride mode,
location/notification permission choices, whether the tracking notification was
visible, and whether the ride was screen-locked or minimized.

WebView HTTP can be throttled after several minutes in the background. The local
track and optional outbox provide durability/eventual delivery; native live HTTP is
not implemented in this phase.

For plugin-specific troubleshooting, consult the installed package README and the
plugin's upstream repository.
