import { describe, expect, it } from 'vitest';
import {
  LocationQualityFilter,
  calculateTrackDistanceMeters,
  getAdaptiveLocationThreshold,
  haversineDistanceMeters,
  splitTrackSegments,
} from './locationFilter';
import type { LocationPoint } from '../types/ride';

const NOW = 1_700_000_000_000;
const latitudeOffset = (meters: number) => meters / 111_320;

const point = (
  elapsedMs = 0,
  distanceMeters = 0,
  overrides: Partial<LocationPoint> = {},
): LocationPoint => ({
  lat: latitudeOffset(distanceMeters),
  lng: 0,
  speed: null,
  accuracy: 5,
  timestamp: new Date(NOW + elapsedMs).toISOString(),
  ...overrides,
});

const createFilter = () => {
  let id = 0;
  return new LocationQualityFilter({ createPointId: () => `point-${++id}` });
};

describe('LocationQualityFilter', () => {
  it.each([
    [0.799, 10_000, 8],
    [0.8, 5000, 5],
    [2.999, 5000, 5],
    [3, 3000, 8],
    [11.999, 3000, 8],
    [12, 2000, 12],
  ])('selects the exact adaptive band at %s m/s', (speed, minIntervalMs, baseDistanceMeters) => {
    expect(getAdaptiveLocationThreshold(speed)).toEqual({ minIntervalMs, baseDistanceMeters });
  });

  it('accepts the first valid fix and normalizes an invalid negative speed', () => {
    const decision = createFilter().evaluate(
      point(0, 0, { speed: -1, accuracy: 50 }),
      'foreground',
      'segment-a',
      NOW,
    );

    expect(decision).toEqual({
      accepted: true,
      point: expect.objectContaining({
        pointId: 'point-1',
        segmentId: 'segment-a',
        source: 'foreground',
        speed: null,
        accuracy: 50,
      }),
    });
  });

  it.each([
    [point(0, 0, { lat: 91 }), 'invalid-coordinate'],
    [point(0, 0, { lng: -181 }), 'invalid-coordinate'],
    [point(0, 0, { accuracy: undefined }), 'invalid-accuracy'],
    [point(0, 0, { accuracy: -1 }), 'invalid-accuracy'],
    [point(0, 0, { accuracy: 51 }), 'inaccurate'],
    [point(0, 0, { timestamp: 'not-a-date' }), 'invalid-timestamp'],
    [point(0, 0, { speed: 71 }), 'implausible-speed'],
  ])('rejects invalid input with %s', (candidate, reason) => {
    expect(
      createFilter().evaluate(candidate, 'foreground', 'segment-a', NOW),
    ).toMatchObject({ accepted: false, reason });
  });

  it('rejects stale and future fixes', () => {
    const filter = createFilter();
    expect(
      filter.evaluate(point(-30_001), 'foreground', 'segment-a', NOW),
    ).toMatchObject({ accepted: false, reason: 'stale' });
    expect(
      filter.evaluate(point(10_001), 'foreground', 'segment-a', NOW),
    ).toMatchObject({ accepted: false, reason: 'future' });
  });

  it('rejects out-of-order and implausible derived movement', () => {
    const filter = createFilter();
    expect(filter.evaluate(point(), 'foreground', 'segment-a', NOW).accepted).toBe(true);
    expect(
      filter.evaluate(point(), 'foreground', 'segment-a', NOW),
    ).toMatchObject({ accepted: false, reason: 'out-of-order' });
    expect(
      filter.evaluate(point(10_000, 800), 'background', 'segment-a', NOW + 10_000),
    ).toMatchObject({ accepted: false, reason: 'implausible-speed' });
  });

  it.each([
    [5_000, 10, 2],
    [3_000, 30, 10],
    [2_000, 30, 15],
  ])(
    'accepts mixed-adaptive movement after %sms and %sm',
    (elapsedMs, distance, expectedSpeed) => {
      const filter = createFilter();
      filter.evaluate(point(), 'foreground', 'segment-a', NOW);
      const decision = filter.evaluate(
        point(elapsedMs, distance),
        'background',
        'segment-a',
        NOW + elapsedMs,
      );
      expect(decision.accepted).toBe(true);
      if (decision.accepted) {
        expect(decision.point.speed).toBeCloseTo(expectedSpeed, 1);
        expect(decision.point.source).toBe('background');
      }
    },
  );

  it('requires both the adaptive interval and the accuracy-aware distance floor', () => {
    const tooSoon = createFilter();
    tooSoon.evaluate(point(), 'foreground', 'segment-a', NOW);
    expect(
      tooSoon.evaluate(point(2_999, 20), 'foreground', 'segment-a', NOW + 2_999),
    ).toMatchObject({ accepted: false, reason: 'too-soon' });

    const noisy = createFilter();
    noisy.evaluate(point(0, 0, { accuracy: 40 }), 'foreground', 'segment-a', NOW);
    expect(
      noisy.evaluate(
        point(10_000, 15, { accuracy: 40 }),
        'foreground',
        'segment-a',
        NOW + 10_000,
      ),
    ).toMatchObject({ accepted: false, reason: 'too-close' });
  });

  it('resets cleanly for a new segment without resetting on source changes', () => {
    const filter = createFilter();
    filter.evaluate(point(), 'foreground', 'segment-a', NOW);
    expect(
      filter.evaluate(point(5_000, 10), 'background', 'segment-a', NOW + 5_000)
        .accepted,
    ).toBe(true);
    filter.reset();
    const next = filter.evaluate(
      point(6_000, 10),
      'foreground',
      'segment-b',
      NOW + 6_000,
    );
    expect(next).toMatchObject({
      accepted: true,
      point: { segmentId: 'segment-b' },
    });
  });
});

describe('track geometry helpers', () => {
  it('calculates haversine distance and excludes cross-segment edges', () => {
    const points = [
      { lat: 0, lng: 0, segmentId: 'a' },
      { lat: latitudeOffset(10), lng: 0, segmentId: 'a' },
      { lat: latitudeOffset(100), lng: 0, segmentId: 'b' },
      { lat: latitudeOffset(110), lng: 0, segmentId: 'b' },
    ];
    expect(haversineDistanceMeters(points[0], points[1])).toBeCloseTo(10, 0);
    expect(calculateTrackDistanceMeters(points)).toBeCloseTo(20, 0);
    expect(splitTrackSegments(points)).toHaveLength(2);
  });

  it('excludes semantic event coordinates from distance', () => {
    const points = [
      { lat: 0, lng: 0, segmentId: 'a' },
      { lat: latitudeOffset(500), lng: 0, segmentId: 'a', event: 'stopover' },
      { lat: latitudeOffset(10), lng: 0, segmentId: 'a' },
    ];
    expect(calculateTrackDistanceMeters(points)).toBeCloseTo(10, 0);
  });
});
