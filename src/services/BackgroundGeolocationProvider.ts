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

const DEFAULT_OPTIONS: WatcherOptions = {
  backgroundMessage: 'Tracking location in background',
  backgroundTitle: 'RoadTrip Tracking',
  requestPermissions: true,
  stale: false,
  distanceFilter: 5,
};

const LAST_BG_TS_KEY = 'bg_last_location_ts';

export class BackgroundGeolocationProvider implements ILocationProvider {
  private watcherId: string | null = null;
  private listeners = new Set<(p: LocationPoint) => void>();

  async start(): Promise<void> {
    if (this.watcherId) return;
    await this.ensureNotificationPermission();
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

  private async ensureNotificationPermission() {
    if (Capacitor.getPlatform() !== 'android') return;
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return;
    const requested = await LocalNotifications.requestPermissions();
    if (requested.display !== 'granted') {
      throw new Error(
        'Notification permission is required for reliable background tracking.',
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
