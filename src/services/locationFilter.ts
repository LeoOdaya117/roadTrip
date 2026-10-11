import type {
  AcceptedLocationPoint,
  LocationPoint,
  LocationSource,
} from '../types/ride';

export const LOCATION_FILTER_LIMITS = {
  maxAccuracyMeters: 50,
  maxSpeedMetersPerSecond: 70,
  maxPointAgeMs: 30_000,
  maxFutureSkewMs: 10_000,
} as const;

export type LocationRejectionReason =
  | 'invalid-coordinate'
  | 'invalid-accuracy'
  | 'inaccurate'
  | 'invalid-timestamp'
  | 'stale'
  | 'future'
  | 'out-of-order'
  | 'implausible-speed'
  | 'too-soon'
  | 'too-close';

export type LocationFilterDecision =
  | { accepted: true; point: AcceptedLocationPoint }
  | {
      accepted: false;
      reason: LocationRejectionReason;
      distanceMeters?: number;
      elapsedMs?: number;
    };

type FilterOptions = {
  createPointId?: () => string;
};

type MovementThreshold = {
  minIntervalMs: number;
  baseDistanceMeters: number;
};

const createId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `point-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getAdaptiveLocationThreshold = (speed: number): MovementThreshold => {
  if (speed < 0.8) return { minIntervalMs: 10_000, baseDistanceMeters: 8 };
  if (speed < 3) return { minIntervalMs: 5_000, baseDistanceMeters: 5 };
  if (speed < 12) return { minIntervalMs: 3_000, baseDistanceMeters: 8 };
  return { minIntervalMs: 2_000, baseDistanceMeters: 12 };
};

const isFiniteCoordinate = (value: number) => Number.isFinite(value);

export const haversineDistanceMeters = (
  a: Pick<LocationPoint, 'lat' | 'lng'>,
  b: Pick<LocationPoint, 'lat' | 'lng'>,
) => {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

export const calculateTrackDistanceMeters = <
  T extends Pick<LocationPoint, 'lat' | 'lng' | 'event'> & { segmentId?: string },
>(points: T[]) => {
  let total = 0;
  let previous: T | undefined;
  for (const current of points) {
    if (current.event) continue;
    if (!previous) {
      previous = current;
      continue;
    }
    if (
      previous.segmentId &&
      current.segmentId &&
      previous.segmentId !== current.segmentId
    ) {
      previous = current;
      continue;
    }
    const distance = haversineDistanceMeters(previous, current);
    if (Number.isFinite(distance) && distance > 0) total += distance;
    previous = current;
  }
  return total;
};

export const splitTrackSegments = <T extends { segmentId?: string }>(points: T[]) => {
  const segments: T[][] = [];
  for (const point of points) {
    const current = segments[segments.length - 1];
    const previous = current?.[current.length - 1];
    if (
      !current ||
      (previous?.segmentId &&
        point.segmentId &&
        previous.segmentId !== point.segmentId)
    ) {
      segments.push([point]);
    } else {
      current.push(point);
    }
  }
  return segments;
};

export class LocationQualityFilter {
  private lastAccepted: AcceptedLocationPoint | null = null;
  private readonly createPointId: () => string;

  constructor(options: FilterOptions = {}) {
    this.createPointId = options.createPointId ?? createId;
  }

  reset() {
    this.lastAccepted = null;
  }

  evaluate(
    rawPoint: LocationPoint,
    source: LocationSource,
    segmentId: string,
    nowMs = Date.now(),
  ): LocationFilterDecision {
    if (
      !isFiniteCoordinate(rawPoint.lat) ||
      !isFiniteCoordinate(rawPoint.lng) ||
      rawPoint.lat < -90 ||
      rawPoint.lat > 90 ||
      rawPoint.lng < -180 ||
      rawPoint.lng > 180
    ) {
      return { accepted: false, reason: 'invalid-coordinate' };
    }

    const accuracy = rawPoint.accuracy;
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0) {
      return { accepted: false, reason: 'invalid-accuracy' };
    }
    if (accuracy > LOCATION_FILTER_LIMITS.maxAccuracyMeters) {
      return { accepted: false, reason: 'inaccurate' };
    }

    const timestampMs = Date.parse(rawPoint.timestamp);
    if (!Number.isFinite(timestampMs)) {
      return { accepted: false, reason: 'invalid-timestamp' };
    }
    if (timestampMs < nowMs - LOCATION_FILTER_LIMITS.maxPointAgeMs) {
      return { accepted: false, reason: 'stale' };
    }
    if (timestampMs > nowMs + LOCATION_FILTER_LIMITS.maxFutureSkewMs) {
      return { accepted: false, reason: 'future' };
    }

    const reportedSpeed =
      typeof rawPoint.speed === 'number' &&
      Number.isFinite(rawPoint.speed) &&
      rawPoint.speed >= 0
        ? rawPoint.speed
        : null;
    if (
      reportedSpeed !== null &&
      reportedSpeed > LOCATION_FILTER_LIMITS.maxSpeedMetersPerSecond
    ) {
      return { accepted: false, reason: 'implausible-speed' };
    }

    const previous = this.lastAccepted;
    if (!previous) {
      const point: AcceptedLocationPoint = {
        ...rawPoint,
        accuracy,
        speed: reportedSpeed,
        pointId: this.createPointId(),
        segmentId,
        source,
      };
      this.lastAccepted = point;
      return { accepted: true, point };
    }

    const previousTimestampMs = Date.parse(previous.timestamp);
    const elapsedMs = timestampMs - previousTimestampMs;
    if (elapsedMs <= 0) {
      return { accepted: false, reason: 'out-of-order', elapsedMs };
    }

    const distanceMeters = haversineDistanceMeters(previous, rawPoint);
    const derivedSpeed = distanceMeters / (elapsedMs / 1000);
    if (derivedSpeed > LOCATION_FILTER_LIMITS.maxSpeedMetersPerSecond) {
      return {
        accepted: false,
        reason: 'implausible-speed',
        distanceMeters,
        elapsedMs,
      };
    }

    const effectiveSpeed = Math.max(reportedSpeed ?? 0, derivedSpeed);
    const threshold = getAdaptiveLocationThreshold(effectiveSpeed);
    if (elapsedMs < threshold.minIntervalMs) {
      return {
        accepted: false,
        reason: 'too-soon',
        distanceMeters,
        elapsedMs,
      };
    }

    const noiseFloor = clamp(
      Math.max(previous.accuracy ?? 0, accuracy) * 0.5,
      5,
      20,
    );
    const minimumDistance = Math.max(threshold.baseDistanceMeters, noiseFloor);
    if (distanceMeters < minimumDistance) {
      return {
        accepted: false,
        reason: 'too-close',
        distanceMeters,
        elapsedMs,
      };
    }

    const speedDifference =
      reportedSpeed === null ? Infinity : Math.abs(reportedSpeed - derivedSpeed);
    const normalizedSpeed =
      reportedSpeed === null || speedDifference > Math.max(5, derivedSpeed * 0.75)
        ? derivedSpeed
        : reportedSpeed;
    const point: AcceptedLocationPoint = {
      ...rawPoint,
      accuracy,
      speed: normalizedSpeed,
      pointId: this.createPointId(),
      segmentId,
      source,
    };
    this.lastAccepted = point;
    return { accepted: true, point };
  }
}
