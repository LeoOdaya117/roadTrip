import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcceptedLocationPoint, NavigationRoute } from '../types/ride';
import { useRideNavigation } from './useRideNavigation';

const mocks = vi.hoisted(() => ({
  calculateOfflineRoute: vi.fn(),
  getNavigationAvailability: vi.fn(),
  speakNavigationPrompt: vi.fn(),
  stopNavigationSpeech: vi.fn(),
  getSession: vi.fn(),
  saveRideSession: vi.fn(),
}));

vi.mock('../services/navigationEngine', () => ({
  calculateOfflineRoute: mocks.calculateOfflineRoute,
  getNavigationAvailability: mocks.getNavigationAvailability,
  speakNavigationPrompt: mocks.speakNavigationPrompt,
  stopNavigationSpeech: mocks.stopNavigationSpeech,
  supportsOfflineNavigation: () => true,
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
    { id: 1, shapeIndex: 1, instruction: 'Turn left', distanceMeters: 100, timeSeconds: 20, lat: 14.601, lng: 121 },
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
    mocks.getNavigationAvailability.mockResolvedValue({ available: true });
    mocks.calculateOfflineRoute.mockResolvedValue(route);
    mocks.speakNavigationPrompt.mockResolvedValue(undefined);
    mocks.stopNavigationSpeech.mockResolvedValue(undefined);
  });

  it('routes from the accepted location and reroutes after three consecutive off-route fixes', async () => {
    let location: AcceptedLocationPoint | null = point('p0', 14.6, 121);
    const { result, rerender } = renderHook(() => useRideNavigation('solo-1', location, true));
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.setDestination({ lat: 14.602, lng: 121, label: 'Destination' });
    });
    expect(mocks.calculateOfflineRoute).toHaveBeenCalledTimes(1);
    expect(result.current.route).toEqual(route);

    await act(async () => result.current.startGuidance());
    for (const [id, lat] of [['p1', 14.61], ['p2', 14.611], ['p3', 14.612]] as const) {
      location = point(id, lat, 121);
      rerender();
    }
    await waitFor(() => expect(mocks.calculateOfflineRoute).toHaveBeenCalledTimes(2));
    expect(mocks.calculateOfflineRoute.mock.calls[1][0]).toMatchObject({ lat: 14.612, lng: 121 });
    expect(mocks.calculateOfflineRoute.mock.calls[1][1].label).toBe('Destination');
  });

  it('keeps only one reroute in flight for the same destination', async () => {
    let resolveReroute: ((value: NavigationRoute) => void) | undefined;
    mocks.calculateOfflineRoute
      .mockResolvedValueOnce(route)
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
    await waitFor(() => expect(mocks.calculateOfflineRoute).toHaveBeenCalledTimes(2));
    expect(resolveReroute).toBeDefined();
    resolveReroute?.(route);
    await waitFor(() => expect(result.current.isRouting).toBe(false));
    expect(mocks.calculateOfflineRoute).toHaveBeenCalledTimes(2);
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
