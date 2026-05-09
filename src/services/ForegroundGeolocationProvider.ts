import { Geolocation } from '@capacitor/geolocation';
import { LocationPoint } from '../types/ride';
import ILocationProvider, { PermissionState } from './ILocationProvider';

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 2000
};

export class ForegroundGeolocationProvider implements ILocationProvider {
  private watchId: string | null = null;
  private listeners = new Set<(p: LocationPoint) => void>();

  async start(): Promise<void> {
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
      const current = await Geolocation.getCurrentPosition(GEOLOCATION_OPTIONS as any);
      this.emit({
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        speed: current.coords.speed ?? null,
        accuracy: current.coords.accuracy ?? null,
        timestamp: new Date(current.timestamp).toISOString()
      });
    } catch (e) {
      // ignore
    }

    try {
      const id = await Geolocation.watchPosition(GEOLOCATION_OPTIONS as any, (position, error) => {
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
      Geolocation.clearWatch({ id: this.watchId });
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
