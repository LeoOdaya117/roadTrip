# Background Geolocation — Installation & Native Setup

This document describes installing and configuring `@capacitor-community/background-geolocation` for the RoadTrip app. Follow these steps after merging the code changes that use the plugin.

## 1) Install the plugin

Run in your project root:

```bash
npm install @capacitor-community/background-geolocation
npx cap sync
```

`npx cap sync` updates native projects (Android / iOS). Run it after installing or changing plugin versions.

## 2) iOS configuration

Add the following keys to your `Info.plist` (copy into Xcode or the plist file used by the iOS project):

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

Also ensure the plugin is present in the Podfile / Swift package manager configuration after `npx cap sync`.

## 3) Android configuration

- Add/verify the runtime permissions in `AndroidManifest.xml` (the plugin README contains the full list for your target Android SDK):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

- For Android 13+ you may need to request `POST_NOTIFICATIONS` at runtime to show the persistent notification used by the foreground service.
- The plugin README recommends setting `android.useLegacyBridge = true` in `capacitor.config.json` to improve background reliability on some Android versions. Consult the plugin docs and Capacitor docs before changing this setting.

Example `strings.xml` entries (optional, controls notification appearance):

```xml
<string name="capacitor_background_geolocation_notification_channel_name">Background Tracking</string>
<string name="capacitor_background_geolocation_notification_icon">mipmap/ic_launcher</string>
<string name="capacitor_background_geolocation_notification_color">#FFEB3B</string>
```

## 4) Runtime permission flow

- The code in `ForegroundGeolocationProvider` and `BackgroundGeolocationProvider` uses the plugin's permission helpers. On iOS/Android the OS flow may prompt the user for `WhenInUse` first, then for `Always` (iOS) or `Background` (Android) later — test flows on real devices.
- For Android 13+ the notification permission must be requested separately if you want the persistent notification shown.

## 5) Testing & validation

- Build and run the app on a device/emulator after `npx cap sync`.
- Verify the app requests location permission when tracking starts in foreground.
- Minimize the app and verify the background watcher continues to emit locations (watch logs or remote telemetry).

## 6) Notes and troubleshooting

- If background updates stop after a few minutes on Android, ensure `android.useLegacyBridge` is considered, and test native foreground-service behavior.
- Network calls from the WebView may be throttled in background on Android after several minutes; use a native HTTP plugin for reliable background uploads.
- Refer to the plugin repository for up-to-date platform instructions: https://github.com/capacitor-community/background-geolocation
