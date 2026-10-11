import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcceptedLocationPoint, NavigationRoute } from '../types/ride';
import { useRideNavigation } from './useRideNavigation';

const mocks = vi.hoisted(() => ({
  calculateRouteOptions: vi.fn(),
  downloadNavigationTiles: vi.fn(),
  getNavigationAvailability: vi.fn(),
  speakNavigationPrompt: vi.fn(),
  stopNavigationSpeech: vi.fn(),
  getSession: vi.fn(),
  saveRideSession: vi.fn(),
}));

vi.mock('../services/navigationEngine', () => ({
  calculateRouteOptions: mocks.calculateRouteOptions,
  downloadNavigationTiles: mocks.downloadNavigationTiles,
  getNavigationAvailability: mocks.getNavigationAvailability,
  speakNavigationPrompt: mocks.speakNavigationPrompt,
  stopNavigationSpeech: mocks.stopNavigationSpeech,
  supportsTurnByTurnNavigation: () => true,
}));

vi.mock('../services/offlineDb', () => ({
  getSession: mocks.getSession,
  saveRideSession: mocks.saveRideSession,
}));

const route: NavigationRoute = {
  coordinates: [
    { lat: 14.6, lng: 121 },
    { lat: 14.601, lng: 121 },
    { lat: 14.602, lng: 121 },
  ],
  maneuvers: [
    { id: 1, shapeIndex: 1, instruction: 'Turn left', streetName: 'Main Street', distanceMeters: 100, timeSeconds: 20, lat: 14.601, lng: 121 },
  ],
  distanceMeters: 500,
  durationSeconds: 100,
};

const point = (pointId: string, lat: number, lng: number): AcceptedLocationPoint => ({
  pointId,
  lat,
  lng,
  accuracy: 5,
  speed: 5,
  timestamp: `2026-10-07T00:00:0${pointId.slice(-1)}.000Z`,
  segmentId: 'segment-1',
  source: 'foreground',
});

describe('useRideNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ rideId: 'solo-1', status: 'active' });
    mocks.saveRideSession.mockResolvedValue(undefined);
    mocks.getNavigationAvailability.mockResolvedValue({ available: true, offlineAvailable: false });
    mocks.downloadNavigationTiles.mockResolvedValue({ available: true, sizeBytes: 237465600 });
    mocks.calculateRouteOptions.mockResolvedValue([{ route, label: 'Recommended' }]);
    mocks.speakNavigationPrompt.mockResolvedValue(undefined);
    mocks.stopNavigationSpeech.mockResolvedValue(undefined);
  });

  it('routes online without a tile download and installs the optional offline pack on request', async () => {
    mocks.getNavigationAvailability
      .mockResolvedValueOnce({ available: true, offlineAvailable: false })
      .mockResolvedValueOnce({ available: true, offlineAvailable: true });
    const { result } = renderHook(() => useRideNavigation('solo-1', point('p0', 14.6, 121), true));

    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.offlineAvailable).toBe(false);

    await act(async () => result.current.downloadTiles());

    expect(mocks.downloadNavigationTiles).toHaveBeenCalledTimes(1);
    expect(result.current.offlineAvailable).toBe(true);
  });

  it('routes from the accepted location and reroutes after three consecutive off-route fixes', async () => {
    let location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(() => useRideNavigation('solo-1', location, true));
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
    });
    expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(1);
    expect(result.current.route).toEqual(route);

    await act(async () => result.current.startGuidance());
    for (const [id, lat] of [['p1', 14.61], ['p2', 14.611], ['p3', 14.612]] as const) {
      location = point(id, lat, 121);
      rerender();
    }
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(2));
    expect(mocks.calculateRouteOptions.mock.calls[1][0]).toMatchObject({ lat: 14.612, lng: 121 });
    expect(mocks.calculateRouteOptions.mock.calls[1][1].label).toBe('Destination');
  });

  it('advances turns, decreases remaining distance, and clears the final maneuver at arrival', async () => {
    const multiManeuverRoute: NavigationRoute = {
      ...route,
      maneuvers: [
        { id: 1, shapeIndex: 1, instruction: 'Turn left', streetName: 'Main Street', distanceMeters: 100, timeSeconds: 20, lat: 14.601, lng: 121 },
        { id: 2, shapeIndex: 2, instruction: 'Turn right', streetName: 'Highland Avenue', distanceMeters: 50, timeSeconds: 10, lat: 14.602, lng: 121 },
      ],
    };
    mocks.calculateRouteOptions.mockResolvedValue([{ route: multiManeuverRoute, label: 'Recommended' }]);
    let location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(() => useRideNavigation('solo-1', location, true));
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });

    expect(result.current.nextInstruction).toBe('Turn left');
    expect(result.current.nextStreetName).toBe('Main Street');
    const initialDistance = result.current.distanceToNextManeuverMeters;

    location = point('p1', 14.6005, 121);
    rerender();
    expect(result.current.distanceToNextManeuverMeters).toBeLessThan(initialDistance ?? Infinity);

    location = point('p2', 14.6015, 121);
    rerender();
    expect(result.current.nextInstruction).toBe('Turn right');
    expect(result.current.nextStreetName).toBe('Highland Avenue');

    location = point('p3', 14.602, 121);
    rerender();
    expect(result.current.nextInstruction).toBeNull();
    expect(result.current.nextStreetName).toBeNull();
    expect(result.current.distanceToNextManeuverMeters).toBeNull();
  });

  it('suppresses stale guidance during reroute and recovers after a failed reroute on a new fix', async () => {
    let rejectReroute: ((error: Error) => void) | undefined;
    mocks.calculateRouteOptions
      .mockResolvedValueOnce([{ route, label: 'Recommended' }])
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectReroute = reject; }))
      .mockResolvedValueOnce([{ route, label: 'Recommended' }]);
    let location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(() => useRideNavigation('solo-1', location, true));
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });
    expect(result.current.nextInstruction).toBe('Turn left');

    for (const id of ['p1', 'p2', 'p3']) {
      location = point(id, 14.6, 121.001);
      rerender();
    }
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(2));
    expect(result.current.isRouting).toBe(true);
    expect(result.current.nextInstruction).toBeNull();
    expect(result.current.distanceToNextManeuverMeters).toBeNull();

    await act(async () => { rejectReroute?.(new Error('reroute unavailable')); });
    await waitFor(() => expect(result.current.isRouting).toBe(false));
    expect(result.current.route).toBeNull();
    expect(result.current.nextInstruction).toBeNull();

    location = point('p4', 14.6001, 121);
    rerender();
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.route).toEqual(route));
    expect(result.current.nextInstruction).toBe('Turn left');
  });

  it('clears guidance while location is lost and restores it when an accepted fix returns', async () => {
    let location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(() => useRideNavigation('solo-1', location, true));
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });
    expect(result.current.nextInstruction).toBe('Turn left');

    location = null;
    rerender();
    expect(result.current.nextInstruction).toBeNull();
    expect(result.current.distanceToNextManeuverMeters).toBeNull();

    location = point('p1', 14.6005, 121);
    rerender();
    expect(result.current.nextInstruction).toBe('Turn left');
    expect(result.current.distanceToNextManeuverMeters).not.toBeNull();
    expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(1);
  });

  it('suppresses retained-location guidance while stale and reroutes only after freshness returns', async () => {
    let hasFreshLocation = false;
    const location = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(
      ({ fresh }) => useRideNavigation('solo-1', location, true, fresh),
      { initialProps: { fresh: hasFreshLocation } },
    );
    await waitFor(() => expect(result.current.supported).toBe(true));

    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });
    expect(mocks.calculateRouteOptions).not.toHaveBeenCalled();
    expect(result.current.isGuiding).toBe(false);
    expect(result.current.error).toMatch(/fresh GPS fix/i);
    expect(mocks.saveRideSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ navigationEnabled: true }),
    );

    hasFreshLocation = true;
    rerender({ fresh: hasFreshLocation });
    await waitFor(() => expect(result.current.route).toEqual(route));
    expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(1);
  });

  it('hides maneuver details during a liveness timeout and restores them from the same accepted point', async () => {
    let hasFreshLocation = true;
    const location = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(
      ({ fresh }) => useRideNavigation('solo-1', location, true, fresh),
      { initialProps: { fresh: hasFreshLocation } },
    );
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });
    expect(result.current.nextInstruction).toBe('Turn left');

    hasFreshLocation = false;
    rerender({ fresh: hasFreshLocation });
    expect(result.current.nextInstruction).toBeNull();
    expect(result.current.distanceToNextManeuverMeters).toBeNull();

    hasFreshLocation = true;
    rerender({ fresh: hasFreshLocation });
    expect(result.current.nextInstruction).toBe('Turn left');
    expect(result.current.distanceToNextManeuverMeters).not.toBeNull();
    expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(1);
  });

  it('hides the frozen maneuver during a pause and refreshes it after resume routing', async () => {
    let resolveResumeRoute: ((value: Array<{ route: NavigationRoute; label: string }>) => void) | undefined;
    mocks.calculateRouteOptions
      .mockResolvedValueOnce([{ route, label: 'Recommended' }])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveResumeRoute = resolve; }));
    const location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(({ tracking }) => useRideNavigation('solo-1', location, tracking), {
      initialProps: { tracking: true },
    });
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });
    expect(result.current.nextInstruction).toBe('Turn left');

    rerender({ tracking: false });
    expect(result.current.nextInstruction).toBeNull();
    expect(result.current.distanceToNextManeuverMeters).toBeNull();

    rerender({ tracking: true });
    await waitFor(() => expect(result.current.isRouting).toBe(true));
    expect(result.current.nextInstruction).toBeNull();
    resolveResumeRoute?.([{ route, label: 'Recommended' }]);
    await waitFor(() => expect(result.current.isRouting).toBe(false));
    expect(result.current.nextInstruction).toBe('Turn left');
  });

  it('keeps only one reroute in flight for the same destination', async () => {
    let resolveReroute: ((value: Array<{ route: NavigationRoute; label: string }>) => void) | undefined;
    mocks.calculateRouteOptions
      .mockResolvedValueOnce([{ route, label: 'Recommended' }])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReroute = resolve; }));
    let location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(() => useRideNavigation('solo-1', location, true));
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });

    for (const [id, lat] of [['p1', 14.61], ['p2', 14.611], ['p3', 14.612], ['p4', 14.613], ['p5', 14.614]] as const) {
      location = point(id, lat, 121);
      rerender();
    }
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(2));
    expect(resolveReroute).toBeDefined();
    resolveReroute?.([{ route, label: 'Recommended' }]);
    await waitFor(() => expect(result.current.isRouting).toBe(false));
    expect(mocks.calculateRouteOptions).toHaveBeenCalledTimes(2);
  });

  it('restores and uses the selected alternate route index', async () => {
    const alternate: NavigationRoute = { ...route, distanceMeters: 700 };
    mocks.getSession.mockResolvedValue({
      rideId: 'solo-1',
      navigationDestination: { lat: 14.602, lng: 121, label: 'Destination' },
      navigationRouteIndex: 1,
      status: 'active',
    });
    mocks.calculateRouteOptions.mockResolvedValue([
      { route, label: 'Recommended' },
      { route: alternate, label: 'Alternative 1' },
    ]);
    const { result } = renderHook(() => useRideNavigation('solo-1', point('p0', 14.6, 121), true));

    await waitFor(() => expect(result.current.route?.distanceMeters).toBe(700));
    expect(result.current.selectedRouteIndex).toBe(1);
  });

  it('stops voice guidance on pause and removes the destination on clear', async () => {
    const location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(({ tracking }) => useRideNavigation('solo-1', location, tracking), {
      initialProps: { tracking: true },
    });
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
      await result.current.startGuidance();
    });
    rerender({ tracking: false });
    await waitFor(() => expect(mocks.stopNavigationSpeech).toHaveBeenCalled());
    await act(async () => result.current.clearDestination());
    expect(result.current.destination).toBeNull();
    expect(mocks.saveRideSession).toHaveBeenLastCalledWith({ rideId: 'solo-1', status: 'active' });
  });
});
