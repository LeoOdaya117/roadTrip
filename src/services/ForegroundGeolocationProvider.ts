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
  private listeners = new Set<(p: LocationPoint) => void>();

  async start(): Promise<void> {
    if (this.watchId) return;
    const permissionStatus = await Geolocation.checkPermissions();
    const perm = permissionStatus.location ?? permissionStatus.coarseLocation ?? 'prompt';

    if (perm !== 'granted') {
      const req = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      const next = req.location ?? req.coarseLocation ?? 'prompt';
      if (next !== 'granted') {
        throw new Error('Location permission not granted');
      }
    }

    try {
      const current = await Geolocation.getCurrentPosition(CURRENT_POSITION_OPTIONS);
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

    try {
      const id = await Geolocation.watchPosition(WATCH_POSITION_OPTIONS, (position, error) => {
        if (error || !position) return;

        this.emit({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: position.coords.speed ?? null,
          accuracy: position.coords.accuracy ?? null,
          timestamp: new Date(position.timestamp).toISOString()
        });
      });

      this.watchId = id as unknown as string;
    } catch (err) {
      this.watchId = null;
      throw err;
    }
  }

  stop(): void {
    if (this.watchId) {
      void Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }

  onLocation(callback: (point: LocationPoint) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async getPermissionState(): Promise<PermissionState> {
    const permissionStatus = await Geolocation.checkPermissions();
    const next = permissionStatus.location ?? permissionStatus.coarseLocation ?? 'prompt';
    return next as PermissionState;
  }

  private emit(p: LocationPoint) {
    this.listeners.forEach((cb) => cb(p));
  }
}

export default ForegroundGeolocationProvider;
