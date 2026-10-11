import { Geolocation } from '@capacitor/geolocation';
import type { LocationPoint } from '../types/ride';

/** Gets one location fix for pre-ride route planning without starting a tracking watch. */
export const getCurrentLocationFix = async (): Promise<LocationPoint> => {
  const permissionStatus = await Geolocation.checkPermissions();
  const permission = permissionStatus.location ?? permissionStatus.coarseLocation ?? 'prompt';
  if (permission !== 'granted') {
    const requested = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    const nextPermission = requested.location ?? requested.coarseLocation ?? 'prompt';
    if (nextPermission !== 'granted') throw new Error('Location permission is needed to compare routes. You can still choose a destination on the map.');
  }

  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 30_000,
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      speed: position.coords.speed ?? null,
      accuracy: position.coords.accuracy ?? null,
      timestamp: new Date(position.timestamp).toISOString(),
    };
  } catch {
    throw new Error('Current location is unavailable. Check GPS or choose a starting point on the map.');
  }
};
