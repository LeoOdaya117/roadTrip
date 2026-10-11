import { Ride } from '../types/ride';
import { getSession, getTrackPoints, getPhotos } from '../services/offlineDb';
import { calculateTrackDistanceMeters } from '../services/locationFilter';

/**
 * Load a ride by id. Prefer the offline Dexie DB session and track points.
 * Falls back to a legacy localStorage ride when available. The synthetic
 * sample ride is reserved for the documented `demo1` preview route.
 */
export async function fetchRideById(rideId: string): Promise<Ride> {
  try {
    const session = await getSession(rideId);
    if (session) {
      const points = await getTrackPoints(rideId);
      const coords = (points || []).map(p => [p.lng, p.lat] as [number, number]);

      // derive stats when missing
      const distanceMeters =
        session.distanceMeters ?? calculateTrackDistanceMeters(points);
      let durationSeconds = session.durationSeconds ?? 0;
      if (!durationSeconds && points && points.length > 1) {
        const first = new Date(points[0].timestamp).getTime();
        const last = new Date(points[points.length - 1].timestamp).getTime();
        durationSeconds = Math.max(0, Math.round((last - first) / 1000));
      }

      const speeds = points
        .filter((point) => !point.event)
        .map((point) => point.speed)
        .filter((speed): speed is number =>
          typeof speed === 'number' && Number.isFinite(speed) && speed >= 0
        );
      const avgSpeedMs = speeds.length ? (speeds.reduce((a, b) => a + b, 0) / speeds.length) : undefined;
      const maxSpeedMs = speeds.length ? Math.max(...speeds) : undefined;

      const photos = await getPhotos(rideId).catch(() => []);
      const photoUrls: string[] = photos.map(ph => {
        try {
          if (ph.thumb) return URL.createObjectURL(ph.thumb);
          if (ph.data) return URL.createObjectURL(ph.data);
          return '';
        } catch {
          return '';
        }
      }).filter(Boolean);

      const stopoverCount = points.filter((point) => point.event === 'stopover').length;

      const ride: Ride = {
        id: rideId,
        polylineGeoJSON: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords
          },
          properties: {}
        },
        distanceMeters: distanceMeters,
        durationSeconds: durationSeconds,
        avgSpeedMs,
        maxSpeedMs,
        elevationGainMeters: session.elevationGainMeters ?? 0,
        stopoverCount,
        startTimeISO: session.createdAt,
        photoUrls
      };

      return ride;
    }
  } catch (err) {
    console.warn('Failed to load ride from the device database; checking legacy ride storage', err);
  }

  // Keep previously stored legacy rides readable without inventing new records.
  const key = `ride:${rideId}`;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Ride;
      return parsed;
    } catch (err) {
      console.warn('Malformed legacy ride in localStorage', err);
    }
  }

  if (rideId !== 'demo1') {
    throw new Error(`Ride ${rideId} was not found on this device.`);
  }

  const mock: Ride = {
    id: rideId,
    polylineGeoJSON: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4233, 37.7749],
          [-122.4210, 37.7755],
          [-122.4194, 37.7760],
          [-122.4160, 37.7770],
          [-122.4120, 37.7780]
        ]
      },
      properties: {}
    },
    distanceMeters: 10000,
    durationSeconds: 3600 + 1200,
    avgSpeedMs: 3.0,
    maxSpeedMs: 8.5,
    elevationGainMeters: 120,
    startTimeISO: new Date().toISOString(),
    photoUrls: []
  };
  try { localStorage.setItem(key, JSON.stringify(mock)); } catch { /* Demo remains usable without storage. */ }
  return mock;
}
