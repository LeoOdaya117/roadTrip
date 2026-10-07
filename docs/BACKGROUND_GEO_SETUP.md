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

Android 13+ notification permission is checked and requested through Capacitor
Local Notifications before the background watcher starts. Denial is exposed as a
recoverable tracking error; the app must not pretend background tracking is active.

Optional notification resources in `strings.xml` are:

```xml
<string name="capacitor_background_geolocation_notification_channel_name">Background Tracking</string>
<string name="capacitor_background_geolocation_notification_icon">mipmap/ic_launcher</string>
<string name="capacitor_background_geolocation_notification_color">#FFEB3B</string>
```

## Runtime behavior

- Foreground permission state comes from Capacitor Geolocation.
- The background plugin requests its supported location permissions when its
  watcher starts and reports authorization errors through the callback.
- Foreground and background fixes pass through the same mixed-adaptive accuracy,
  time, distance, and speed filter. Rejected coordinates are not persisted.
- Native background callbacks use a 5 m distance filter and reject stale fixes.
- Provider switching retains the current filter baseline; a stopover resume starts
  a new segment instead.

## Device validation

After sync, build and run on a real Android device or prepared emulator:

1. Test precise-location grant, approximate grant, denial, and later recovery.
2. On Android 13+, test notification grant and denial independently.
3. Start a ride, turn the screen off for at least 15 minutes, and verify accepted
   points continue to appear in IndexedDB and the foreground notification remains.
4. Resume the app and confirm one foreground watch replaces the background watch.
5. Lose network connectivity and confirm local track persistence continues; when
   batch sync is enabled, verify its durable queue flushes after reconnect/resume.
6. Pause at a stopover, move the device, resume, and verify the paused movement is
   not included in route distance.
7. Kill and relaunch during an active ride and verify session/track recovery.

WebView HTTP can be throttled after several minutes in the background. The local
track and optional outbox provide durability/eventual delivery; native live HTTP is
not implemented in this phase.

For plugin-specific troubleshooting, consult the installed package README and the
plugin's upstream repository.
