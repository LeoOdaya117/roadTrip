import { Geolocation } from '@capacitor/geolocation';
import type { PositionOptions } from '@capacitor/geolocation';
import { LocationPoint } from '../types/ride';
import ILocationProvider, { PermissionState } from './ILocationProvider';

const CURRENT_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

const WATCH_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 0,
  minimumUpdateInterval: 2000,
};

export class ForegroundGeolocationProvider implements ILocationProvider {
  private watchId: string | null = null;
  private generation = 0;
  private pendingStart: { generation: number; promise: Promise<void> } | null = null;
  private listeners = new Set<(p: LocationPoint) => void>();

  start(): Promise<void> {
    if (this.watchId) return Promise.resolve();
    const generation = this.generation;
    if (this.pendingStart?.generation === generation) return this.pendingStart.promise;
    const previous = this.pendingStart?.promise;
    const promise = (async () => {
      // A cancelled native registration must settle and release its ID first.
      if (previous) await previous.catch(() => {});
      if (generation !== this.generation) return;
      try {
        await this.startWatch(generation);
      } catch (error) {
        if (generation === this.generation) throw error;
      }
    })().finally(() => {
      if (this.pendingStart?.promise === promise) this.pendingStart = null;
    });
    this.pendingStart = { generation, promise };
    return promise;
  }

  private async startWatch(generation: number): Promise<void> {
    const permissionStatus = await Geolocation.checkPermissions();
    if (generation !== this.generation) return;
    const hasLocationPermission = permissionStatus.location === 'granted'
      || permissionStatus.coarseLocation === 'granted';

    if (!hasLocationPermission) {
      const req = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (generation !== this.generation) return;
      const permissionGranted = req.location === 'granted'
        || req.coarseLocation === 'granted';
      if (!permissionGranted) {
        throw new Error('Location permission not granted');
      }
    }

    try {
      const current = await Geolocation.getCurrentPosition(CURRENT_POSITION_OPTIONS);
      if (generation !== this.generation) return;
      this.emit({
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        speed: current.coords.speed ?? null,
        accuracy: current.coords.accuracy ?? null,
        timestamp: new Date(current.timestamp).toISOString()
      });
    } catch {
      // The watch below remains authoritative when an immediate fix times out.
    }

    if (generation !== this.generation) return;
    const id = await Geolocation.watchPosition(WATCH_POSITION_OPTIONS, (position, error) => {
      if (generation !== this.generation) return;
      if (error || !position) return;

      this.emit({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        speed: position.coords.speed ?? null,
        accuracy: position.coords.accuracy ?? null,
        timestamp: new Date(position.timestamp).toISOString()
      });
    });

    if (generation !== this.generation) {
      await this.removeWatch(id);
      return;
    }
    this.watchId = id;
  }

  stop(): void {
    this.generation += 1;
    if (this.watchId) {
      const id = this.watchId;
      this.watchId = null;
      void this.removeWatch(id);
    }
  }

  private async removeWatch(id: string): Promise<void> {
    try {
      await Geolocation.clearWatch({ id });
    } catch {
      console.warn('[ForegroundGeolocationProvider] Failed to remove location watch.');
    }
  }

  onLocation(callback: (point: LocationPoint) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async getPermissionState(): Promise<PermissionState> {
    const permissionStatus = await Geolocation.checkPermissions();
    const next = permissionStatus.location === 'granted'
      || permissionStatus.coarseLocation === 'granted'
      ? 'granted'
      : permissionStatus.location ?? permissionStatus.coarseLocation ?? 'prompt';
    return next as PermissionState;
  }

  private emit(p: LocationPoint) {
    this.listeners.forEach((cb) => cb(p));
  }
}

export default ForegroundGeolocationProvider;
