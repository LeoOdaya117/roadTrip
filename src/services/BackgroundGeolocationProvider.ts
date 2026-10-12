import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location as BackgroundLocation,
  WatcherOptions,
} from '@capacitor-community/background-geolocation';
import { LocationPoint } from '../types/ride';
import ILocationProvider, { PermissionState } from './ILocationProvider';

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

interface AndroidBackgroundLocationPermissionPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
}

const AndroidBackgroundLocationPermission =
  registerPlugin<AndroidBackgroundLocationPermissionPlugin>(
    'AndroidBackgroundLocationPermission',
  );

const DEFAULT_OPTIONS: WatcherOptions = {
  backgroundMessage: 'Tracking location in background',
  backgroundTitle: 'RoadTrip Tracking',
  // Permission prompts are handled by prepareForBackgroundTracking() while the
  // app is active. A lifecycle switch must never open a prompt in the background.
  requestPermissions: false,
  stale: false,
  distanceFilter: 5,
};

const LAST_BG_TS_KEY = 'bg_last_location_ts';

export class BackgroundGeolocationProvider implements ILocationProvider {
  private watcherId: string | null = null;
  private listeners = new Set<(p: LocationPoint) => void>();

  async prepareForBackgroundTracking(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;

    await this.ensureAppIsActive();
    await this.ensureNotificationPermission(true);
    await this.ensureAppIsActive();
    await this.ensureAndroidBackgroundLocationPermission(true);
  }

  async start(): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      await this.ensureNotificationPermission(false);
      await this.ensureLocationPermission();
      await this.ensureAndroidBackgroundLocationPermission(false);
    }

    if (this.watcherId) return;
    try {
      this.watcherId = await BackgroundGeolocation.addWatcher(
        DEFAULT_OPTIONS,
        (location?: BackgroundLocation, error?: CallbackError) => {
          if (error) {
            console.warn('[BackgroundGeolocationProvider] watcher error', {
              code: error.code,
              message: error.message,
            });
            return;
          }
          if (!location) return;
          this.emit({
            lat: location.latitude,
            lng: location.longitude,
            speed: location.speed,
            accuracy: location.accuracy,
            timestamp: new Date(location.time ?? Date.now()).toISOString(),
          });
        },
      );
    } catch (error) {
      this.watcherId = null;
      throw error;
    }
  }

  stop(): void {
    if (this.watcherId) {
      const watcherId = this.watcherId;
      this.watcherId = null;
      void BackgroundGeolocation.removeWatcher({ id: watcherId }).catch((error: unknown) => {
        console.warn('[BackgroundGeolocationProvider] failed to remove watcher', error);
      });
    }
  }

  onLocation(callback: (point: LocationPoint) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async getPermissionState(): Promise<PermissionState> {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted' || status.coarseLocation === 'granted') {
        return 'granted';
      }
      return status.location ?? status.coarseLocation ?? 'prompt';
    } catch {
      return 'prompt';
    }
  }

  private emit(p: LocationPoint) {
    this.listeners.forEach((cb) => cb(p));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_BG_TS_KEY, p.timestamp);
      }
    } catch {
      // ignore storage errors
    }
  }

  private async ensureAppIsActive() {
    let state: Awaited<ReturnType<typeof App.getState>>;
    try {
      state = await App.getState();
    } catch {
      throw new Error(
        'Unable to confirm RoadTrip is active. Open the app and retry background tracking permission setup.',
      );
    }
    if (!state.isActive) {
      throw new Error(
        'Open RoadTrip and retry background tracking permission setup while the app is active.',
      );
    }
  }

  private async ensureNotificationPermission(allowPrompt: boolean) {
    let current: Awaited<ReturnType<typeof LocalNotifications.checkPermissions>>;
    try {
      current = await LocalNotifications.checkPermissions();
    } catch {
      throw new Error(
        'Unable to check Android notification permission. Open RoadTrip and enable notifications in Android Settings.',
      );
    }
    if (current.display === 'granted') return;
    if (!allowPrompt) {
      throw new Error(
        'Enable notifications for RoadTrip in Android Settings, then resume tracking.',
      );
    }

    let requested: Awaited<ReturnType<typeof LocalNotifications.requestPermissions>>;
    try {
      requested = await LocalNotifications.requestPermissions();
    } catch {
      throw new Error(
        'Notification permission is needed for background tracking. Enable notifications for RoadTrip in Android Settings, then retry.',
      );
    }
    if (requested.display !== 'granted') {
      throw new Error(
        'Notification permission is needed for background tracking. Enable notifications for RoadTrip in Android Settings, then retry.',
      );
    }
  }

  private async ensureLocationPermission() {
    let status: Awaited<ReturnType<typeof Geolocation.checkPermissions>>;
    try {
      status = await Geolocation.checkPermissions();
    } catch {
      throw new Error(
        'Unable to check Android location permission. Open RoadTrip and allow location access while using the app.',
      );
    }
    if (status.location === 'granted' || status.coarseLocation === 'granted') return;

    throw new Error(
      'Allow RoadTrip to access location while using the app, then resume tracking.',
    );
  }

  private async ensureAndroidBackgroundLocationPermission(allowPrompt: boolean) {
    let current: { granted: boolean };
    try {
      current = await AndroidBackgroundLocationPermission.checkPermission();
    } catch {
      throw new Error(
        'Unable to check Android background location permission. Open RoadTrip and allow background location in Android Settings.',
      );
    }
    if (current.granted) return;
    if (!allowPrompt) {
      throw new Error(
        'Allow RoadTrip background location in Android Settings, then return to the ride to resume background tracking.',
      );
    }

    let requested: { granted: boolean };
    try {
      requested = await AndroidBackgroundLocationPermission.requestPermission();
    } catch {
      throw new Error(
        'Background location is needed to track while the screen is locked. Allow RoadTrip background location in Android Settings, then retry.',
      );
    }
    if (!requested.granted) {
      throw new Error(
        'Background location is needed to track while the screen is locked. Allow RoadTrip background location in Android Settings, then retry.',
      );
    }
  }

  getLastBackgroundTimestamp(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(LAST_BG_TS_KEY);
      }
    } catch {
      // localStorage may be unavailable in privacy mode
    }
    return null;
  }
}

export default BackgroundGeolocationProvider;
