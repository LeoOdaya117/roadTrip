import { describe, expect, it } from 'vitest';
import type { NavigationRoute } from '../types/ride';
import {
  decodeValhallaPolyline,
  distanceFromRouteProgressToShapeIndexMeters,
  nearestRouteProgress,
  nextRouteManeuver,
  normalizeValhallaRoute,
  normalizeValhallaRoutes,
  routeOffTrackThresholdMeters,
  updateOffRouteFixCount,
} from './navigationRoute';

const encodePolyline = (points: Array<{ lat: number; lng: number }>, precision = 6) => {
  let previousLat = 0;
  let previousLng = 0;
  const output: string[] = [];
  const append = (value: number) => {
    let encoded = value < 0 ? ~(value << 1) : value << 1;
    while (encoded >= 0x20) {
      output.push(String.fromCharCode((0x20 | (encoded & 0x1f)) + 63));
      encoded >>= 5;
    }
    output.push(String.fromCharCode(encoded + 63));
  };
  const factor = 10 ** precision;
  points.forEach(({ lat, lng }) => {
    const scaledLat = Math.round(lat * factor);
    const scaledLng = Math.round(lng * factor);
    append(scaledLat - previousLat);
    append(scaledLng - previousLng);
    previousLat = scaledLat;
    previousLng = scaledLng;
  });
  return output.join('');
};

describe('navigationRoute', () => {
  const points = [
    { lat: 14.6, lng: 121.0 },
    { lat: 14.6002, lng: 121.0002 },
    { lat: 14.6004, lng: 121.0004 },
  ];

  it('decodes Valhalla precision-six geometry as latitude/longitude pairs', () => {
    expect(decodeValhallaPolyline(encodePolyline(points))).toEqual(points);
  });

  it('normalizes the Valhalla route shape, maneuvers, length, and time', () => {
    const result = normalizeValhallaRoute(JSON.stringify({
      trip: {
        legs: [{
          shape: encodePolyline(points),
          summary: { length: 1.25, time: 240 },
          maneuvers: [
            { begin_shape_index: 0, instruction: '  Head   north  ', length: 0.5, time: 90 },
            { begin_shape_index: 2, verbal_transition_alert_instruction: 'Turn right', street_names: ['  Highland Ave  '], length: 0.75, time: 150 },
          ],
        }],
      },
    }));

    expect(result.coordinates).toEqual(points);
    expect(result.distanceMeters).toBe(1250);
    expect(result.durationSeconds).toBe(240);
    expect(result.maneuvers[0].instruction).toBe('Head north');
    expect(result.maneuvers[1]).toMatchObject({
      shapeIndex: 2,
      instruction: 'Turn right',
      streetName: 'Highland Ave',
      lat: points[2].lat,
      lng: points[2].lng,
    });
  });

  it('normalizes the primary route and any alternatives returned by Valhalla', () => {
    const trip = (length: number) => ({
      legs: [{ shape: encodePolyline(points), summary: { length, time: 240 }, maneuvers: [] }],
    });
    const routes = normalizeValhallaRoutes(JSON.stringify({
      trip: trip(1.25),
      alternates: [{ trip: trip(1.8) }, { trip: trip(2.1) }],
    }));

    expect(routes).toHaveLength(3);
    expect(routes.map(({ label }) => label)).toEqual(['Recommended', 'Alternative 1', 'Alternative 2']);
    expect(routes.map(({ route }) => route.distanceMeters)).toEqual([1250, 1800, 2100]);
    expect(routes[1].route.coordinates).toEqual(points);
  });

  it('finds route progress and the next turn without changing coordinate order', () => {
    const route = normalizeValhallaRoute(JSON.stringify({
      trip: { legs: [{
        shape: encodePolyline(points),
        summary: { length: 0.1, time: 20 },
        maneuvers: [
          { begin_shape_index: 0, instruction: 'Continue', length: 0.05, time: 10 },
          { begin_shape_index: 2, instruction: 'Turn left', length: 0.05, time: 10 },
        ],
      }] },
    }));
    const progress = nearestRouteProgress({ lat: 14.6002, lng: 121.0002 }, route);
    expect(progress.distanceMeters).toBeLessThan(1);
    expect(nextRouteManeuver(progress.shapeIndex, route)?.instruction).toBe('Turn left');
  });

  it('returns no maneuver after the final turn and measures progress within the current segment', () => {
    const route = normalizeValhallaRoute(JSON.stringify({
      trip: { legs: [{
        shape: encodePolyline(points),
        summary: { length: 0.1, time: 20 },
        maneuvers: [{ begin_shape_index: 1, instruction: 'Turn left', length: 0.05, time: 10 }],
      }] },
    }));
    const beforeTurn = nearestRouteProgress({ lat: 14.6001, lng: 121.0001 }, route);
    const closerToTurn = nearestRouteProgress({ lat: 14.60018, lng: 121.00018 }, route);
    const distanceBefore = distanceFromRouteProgressToShapeIndexMeters(
      beforeTurn.shapeIndex,
      beforeTurn.fraction,
      1,
      route,
    );
    const distanceCloser = distanceFromRouteProgressToShapeIndexMeters(
      closerToTurn.shapeIndex,
      closerToTurn.fraction,
      1,
      route,
    );

    expect(distanceCloser).toBeLessThan(distanceBefore);
    expect(nextRouteManeuver(1, route)).toBeNull();
    expect(nextRouteManeuver(2, route)).toBeNull();
    const finalPointManeuverRoute: NavigationRoute = {
      ...route,
      maneuvers: [{ ...route.maneuvers[0], shapeIndex: 2 }],
    };
    expect(nextRouteManeuver(1, finalPointManeuverRoute, 1)).toBeNull();
    expect(nextRouteManeuver(0, { ...route, maneuvers: [] })).toBeNull();
  });

  it('keeps a maneuver street name optional and accepts Valhalla begin street names as a fallback', () => {
    const makeRoute = (maneuver: Record<string, unknown>) => normalizeValhallaRoute(JSON.stringify({
      trip: { legs: [{
        shape: encodePolyline(points),
        summary: { length: 0.1, time: 20 },
        maneuvers: [{ begin_shape_index: 1, instruction: 'Turn left', ...maneuver }],
      }] },
    }));

    expect(makeRoute({}).maneuvers[0].streetName).toBeUndefined();
    expect(makeRoute({ street_names: [], begin_street_names: ['Lake Road'] }).maneuvers[0].streetName)
      .toBe('Lake Road');
    expect(makeRoute({ street_names: ['', 'River Road'], begin_street_names: ['Lake Road'] }).maneuvers[0].streetName)
      .toBe('River Road');
  });

  it('applies the minimum and accuracy-based off-route threshold', () => {
    expect(routeOffTrackThresholdMeters(null)).toBe(40);
    expect(routeOffTrackThresholdMeters(10)).toBe(40);
    expect(routeOffTrackThresholdMeters(30)).toBe(60);
  });

  it('requests a reroute only after three consecutive accepted fixes are off route', () => {
    const first = updateOffRouteFixCount(0, 50, 5);
    const second = updateOffRouteFixCount(first.count, 50, 5);
    const third = updateOffRouteFixCount(second.count, 50, 5);
    const onRoute = updateOffRouteFixCount(third.count, 10, 5);
    expect(first).toEqual({ count: 1, shouldReroute: false });
    expect(second).toEqual({ count: 2, shouldReroute: false });
    expect(onRoute).toEqual({ count: 0, shouldReroute: false });
    expect(third).toEqual({ count: 3, shouldReroute: true });
  });

  it('rejects malformed route responses and malformed encoded geometry', () => {
    expect(() => normalizeValhallaRoute('{bad json')).toThrow(/unreadable route/i);
    expect(() => normalizeValhallaRoute('{"trip":{"legs":[]}}')).toThrow(/no route/i);
    expect(() => decodeValhallaPolyline('~')).toThrow(/geometry is invalid/i);
  });
});
