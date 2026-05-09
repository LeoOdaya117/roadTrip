import { registerPlugin } from '@capacitor/core';
import { LocationPoint } from '../types/ride';
import ILocationProvider, { PermissionState } from './ILocationProvider';

declare global {
  interface Window {
    __bgGeoPlugin?: any;
  }
}

const BackgroundGeolocation = (() => {
  if (typeof window !== 'undefined' && (window as any).__bgGeoPlugin) {
    return (window as any).__bgGeoPlugin;
  }

  try {
    const p = registerPlugin('BackgroundGeolocation') as any;
    if (typeof window !== 'undefined') {
      (window as any).__bgGeoPlugin = p;
    }
    return p;
  } catch (err) {
    // Fallback: if another loader attached the plugin to window, reuse it
    if (typeof window !== 'undefined' && (window as any).BackgroundGeolocation) {
      return (window as any).BackgroundGeolocation;
    }
    throw err;
  }
})();

const DEFAULT_OPTIONS = {
  backgroundMessage: 'Tracking location in background',
  backgroundTitle: 'RoadTrip Tracking',
  requestPermissions: true,
  stale: false,
  distanceFilter: 0
};

const LAST_BG_TS_KEY = 'bg_last_location_ts';

export class BackgroundGeolocationProvider implements ILocationProvider {
  private watcherId: string | null = null;
  private heartbeatId: number | null = null;
  private listeners = new Set<(p: LocationPoint) => void>();

  async start(): Promise<void> {

    try {
          // Log permission state before starting watcher
          try {
            const perms = await BackgroundGeolocation.hasPermissions();
            console.debug('[BackgroundGeolocationProvider] start - hasPermissions', { perms });
          } catch (permErr) {
            console.debug('[BackgroundGeolocationProvider] start - hasPermissions check failed', { permErr });
          }

          console.debug('[BackgroundGeolocationProvider] addWatcher start', { options: DEFAULT_OPTIONS });
          const id = await BackgroundGeolocation.addWatcher(DEFAULT_OPTIONS as any, (location: any, error: any) => {
            console.debug('[BackgroundGeolocationProvider] addWatcher callback', { location, error });
            if (error) {
              console.debug('[BackgroundGeolocationProvider] watcher error', error);
              return;
            }
            if (!location) return;

            const point: LocationPoint = {
              lat: (location.latitude ?? location.lat) as number,
              lng: (location.longitude ?? location.lng) as number,
              speed: (location.speed ?? null) as number | null,
              accuracy: (location.accuracy ?? null) as number | null,
              timestamp: new Date((location.time as number) ?? Date.now()).toISOString()
            };

            console.debug('[BackgroundGeolocationProvider] emit location point', point);
            this.emit(point);
          });

          this.watcherId = id as unknown as string;
          console.debug('[BackgroundGeolocationProvider] addWatcher registered', { watcherId: this.watcherId });

          // Start a heartbeat logger so we can see the watcher is alive
          try {
            if (this.heartbeatId == null) {
              this.heartbeatId = (globalThis.setInterval(() => {
                console.debug('[BackgroundGeolocationProvider] heartbeat - watcher active', { watcherId: this.watcherId });
              }, 15000) as unknown) as number;
            }
          } catch (_) {}
        } catch (err) {
          this.watcherId = null;
          console.debug('[BackgroundGeolocationProvider] addWatcher failed', { err });
          throw err;
    }
  }

  stop(): void {
    if (this.watcherId) {
      console.debug('[BackgroundGeolocationProvider] removeWatcher', { watcherId: this.watcherId });
      BackgroundGeolocation.removeWatcher({ id: this.watcherId } as any).then(() => {
        console.debug('[BackgroundGeolocationProvider] removeWatcher result', { watcherId: this.watcherId });
      }).catch((e: any) => {
        console.debug('[BackgroundGeolocationProvider] removeWatcher failed', { err: e });
      });
      this.watcherId = null;
    }

    if (this.heartbeatId != null) {
      try { globalThis.clearInterval(this.heartbeatId as any); } catch (_) {}
      this.heartbeatId = null;
    } else {
      console.debug('[BackgroundGeolocationProvider] stop called but no watcherId present');
    }
  }

  onLocation(callback: (point: LocationPoint) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async getPermissionState(): Promise<PermissionState> {
    try {
          const status = await BackgroundGeolocation.hasPermissions();
          console.debug('[BackgroundGeolocationProvider] hasPermissions', { status });
          const next = (status as any).location ?? (status as any).coarseLocation ?? 'prompt';
          return next as PermissionState;
    } catch (_) {
      return 'prompt';
    }
  }

  private emit(p: LocationPoint) {
    this.listeners.forEach((cb) => cb(p));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_BG_TS_KEY, p.timestamp);
        console.debug('[BackgroundGeolocationProvider] saved last background timestamp', { key: LAST_BG_TS_KEY, timestamp: p.timestamp });
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  getLastBackgroundTimestamp(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(LAST_BG_TS_KEY);
      }
    } catch (_) {}
    return null;
  }
}

export default BackgroundGeolocationProvider;
