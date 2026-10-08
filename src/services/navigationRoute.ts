import type { NavigationManeuver, NavigationRoute } from '../types/ride';

type LatLng = { lat: number; lng: number };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const finiteNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const decodeValhallaPolyline = (encoded: string, precision = 6): LatLng[] => {
  const coordinates: LatLng[] = [];
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length || shift > 30) {
        throw new Error('The route geometry is invalid.');
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) {
        throw new Error('The route geometry is invalid.');
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += readDelta();
    lng += readDelta();
    coordinates.push({ lat: lat / factor, lng: lng / factor });
  }
  return coordinates;
};

export const normalizeValhallaRoute = (json: string): NavigationRoute => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('The routing service returned an unreadable route.');
  }

  const trip = asRecord(asRecord(parsed)?.trip);
  const legs = trip?.legs;
  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error('No route is available for this destination.');
  }

  const coordinates: LatLng[] = [];
  const maneuvers: NavigationManeuver[] = [];
  let totalDistanceMeters = 0;
  let totalTimeSeconds = 0;

  legs.forEach((legValue, legIndex) => {
    const leg = asRecord(legValue);
    const shape = leg?.shape;
    if (typeof shape !== 'string') return;
    const legCoordinates = decodeValhallaPolyline(shape);
    const shapeOffset = coordinates.length;
    coordinates.push(...legCoordinates);

    const summary = asRecord(leg?.summary);
    totalDistanceMeters += finiteNumber(summary?.length) * 1000;
    totalTimeSeconds += finiteNumber(summary?.time);

    if (Array.isArray(leg?.maneuvers)) {
      leg.maneuvers.forEach((maneuverValue, maneuverIndex) => {
        const maneuver = asRecord(maneuverValue);
        if (!maneuver) return;
        const localIndex = Math.max(0, Math.min(
          legCoordinates.length - 1,
          Math.round(finiteNumber(maneuver.begin_shape_index)),
        ));
        const point = legCoordinates[localIndex];
        if (!point) return;
        const verbal = [
          maneuver.verbal_pre_transition_instruction,
          maneuver.verbal_transition_alert_instruction,
          maneuver.instruction,
        ].find((value) => typeof value === 'string' && value.trim().length > 0);
        if (typeof verbal !== 'string') return;
        maneuvers.push({
          id: legIndex * 1000 + maneuverIndex,
          shapeIndex: shapeOffset + localIndex,
          instruction: verbal,
          distanceMeters: finiteNumber(maneuver.length) * 1000,
          timeSeconds: finiteNumber(maneuver.time),
          ...point,
        });
      });
    }
  });

  if (coordinates.length < 2) {
    throw new Error('The routing service returned no usable road geometry.');
  }
  return {
    coordinates,
    maneuvers,
    distanceMeters: totalDistanceMeters,
    durationSeconds: totalTimeSeconds,
  };
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const haversineMeters = (a: LatLng, b: LatLng) => {
  const radius = 6_371_000;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const value = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat))
    * Math.sin(lngDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const distanceToSegmentMeters = (point: LatLng, start: LatLng, end: LatLng) => {
  const metersPerDegree = 111_320;
  const meanLat = toRadians((start.lat + end.lat + point.lat) / 3);
  const xScale = metersPerDegree * Math.cos(meanLat);
  const startX = start.lng * xScale;
  const endX = end.lng * xScale;
  const pointX = point.lng * xScale;
  const startY = start.lat * metersPerDegree;
  const endY = end.lat * metersPerDegree;
  const pointY = point.lat * metersPerDegree;
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared));
  return Math.hypot(pointX - (startX + fraction * dx), pointY - (startY + fraction * dy));
};

export const nearestRouteProgress = (point: LatLng, route: NavigationRoute) => {
  if (route.coordinates.length < 2) return { distanceMeters: Infinity, shapeIndex: 0 };
  let nearest = { distanceMeters: Infinity, shapeIndex: 0 };
  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    const distanceMeters = distanceToSegmentMeters(
      point,
      route.coordinates[index],
      route.coordinates[index + 1],
    );
    if (distanceMeters < nearest.distanceMeters) {
      nearest = { distanceMeters, shapeIndex: index };
    }
  }
  return nearest;
};

export const distanceAlongRouteMeters = (
  startIndex: number,
  endIndex: number,
  route: NavigationRoute,
) => {
  const first = Math.max(0, Math.min(startIndex, endIndex));
  const last = Math.min(route.coordinates.length - 1, Math.max(startIndex, endIndex));
  let distance = 0;
  for (let index = first; index < last; index += 1) {
    distance += haversineMeters(route.coordinates[index], route.coordinates[index + 1]);
  }
  return distance;
};

export const nextRouteManeuver = (shapeIndex: number, route: NavigationRoute) =>
  route.maneuvers.find((maneuver) => maneuver.shapeIndex > shapeIndex)
    ?? route.maneuvers[route.maneuvers.length - 1]
    ?? null;

export const routeOffTrackThresholdMeters = (accuracy?: number | null) =>
  Math.max(40, Math.max(0, accuracy ?? 0) * 2);

export const updateOffRouteFixCount = (
  currentCount: number,
  distanceFromRouteMeters: number,
  accuracy?: number | null,
) => {
  const offRoute = distanceFromRouteMeters >= routeOffTrackThresholdMeters(accuracy);
  const count = offRoute ? currentCount + 1 : 0;
  return { count, shouldReroute: count >= 3 };
};
