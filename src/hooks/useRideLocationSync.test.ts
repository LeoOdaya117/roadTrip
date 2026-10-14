import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcceptedLocationPoint, LocationPoint } from '../types/ride';

const mocks = vi.hoisted(() => ({
  persistAcceptedLocation: vi.fn(),
  sendLocation: vi.fn(),
  sendLocationBatch: vi.fn(),
  getLastLocation: vi.fn(),
  getPendingOutboxCount: vi.fn(),
  getDueOutboxBatch: vi.fn(),
  acknowledgeOutboxPoints: vi.fn(),
  failOutboxPoints: vi.fn(),
  pauseOutboxPointsForAuthentication: vi.fn(),
  rescheduleOutboxPoints: vi.fn(),
  backgroundCallback: null as ((point: LocationPoint) => void) | null,
  appStateCallback: null as ((state: { isActive: boolean }) => Promise<void>) | null,
  backgroundStart: vi.fn(),
  backgroundStop: vi.fn(),
}));

vi.mock('../services/api', () => ({
  LocationBatchRequestError: class LocationBatchRequestError extends Error {
    status?: number;
  },
  sendLocation: mocks.sendLocation,
  sendLocationBatch: mocks.sendLocationBatch,
}));

vi.mock('../services/offlineDb', () => ({
  persistAcceptedLocation: mocks.persistAcceptedLocation,
  getLastLocation: mocks.getLastLocation,
  getPendingOutboxCount: mocks.getPendingOutboxCount,
  getDueOutboxBatch: mocks.getDueOutboxBatch,
  acknowledgeOutboxPoints: mocks.acknowledgeOutboxPoints,
  failOutboxPoints: mocks.failOutboxPoints,
  pauseOutboxPointsForAuthentication: mocks.pauseOutboxPointsForAuthentication,
  rescheduleOutboxPoints: mocks.rescheduleOutboxPoints,
}));

vi.mock('@capacitor/app', () => ({ App: {
  getState: vi.fn().mockResolvedValue({ isActive: true }),
  addListener: vi.fn((_event: string, callback: (state: { isActive: boolean }) => Promise<void>) => {
    mocks.appStateCallback = callback;
    return Promise.resolve({ remove: vi.fn() });
  }),
} }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => 'android', isNativePlatform: () => true,
} }));
vi.mock('../services/locationPermissions', () => ({ prepareLocationPermissions: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/LocationProviderFactory', () => ({ createLocationProviders: () => ({
  foreground: { start: vi.fn(), stop: vi.fn(), onLocation: vi.fn(), getPermissionState: vi.fn().mockResolvedValue('granted') },
  background: {
    start: mocks.backgroundStart,
    stop: mocks.backgroundStop,
    prepareForBackgroundTracking: vi.fn(),
    getPermissionState: vi.fn().mockResolvedValue('granted'),
    onLocation: (callback: (point: LocationPoint) => void) => {
      mocks.backgroundCallback = callback;
      return () => { mocks.backgroundCallback = null; };
    },
  },
}) }));

import { useRideLocationSync } from './useRideLocationSync';
import { useLocationTracker } from './useLocationTracker';

describe('useRideLocationSync offline persistence', () => {
  const point: AcceptedLocationPoint = {
    lat: 14.6,
    lng: 121,
    speed: 4,
    accuracy: 6,
    timestamp: '2026-10-12T10:00:00.000Z',
    pointId: 'point-offline-1',
    segmentId: 'segment-1',
    source: 'background',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
    mocks.persistAcceptedLocation.mockReset().mockResolvedValue(undefined);
    mocks.sendLocation.mockReset().mockResolvedValue(undefined);
    mocks.backgroundStart.mockReset().mockResolvedValue(undefined);
    mocks.backgroundCallback = null;
    mocks.appStateCallback = null;
    mocks.getLastLocation.mockResolvedValue(undefined);
    mocks.getPendingOutboxCount.mockResolvedValue(0);
    mocks.getDueOutboxBatch.mockResolvedValue([]);
  });

  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const params = {
    rideId: 'group-offline-ride', riderId: 'rider-1',
    isTracking: true, isOnline: false, isSoloMode: false,
  };

  it('persists accepted background points locally while offline without attempting upload', async () => {
    const { result } = renderHook(() => useRideLocationSync(params));
    await act(async () => {
      result.current.persistLocation(point);
      await result.current.flushPendingLocations();
    });

    expect(mocks.persistAcceptedLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        rideId: 'group-offline-ride',
        riderId: 'rider-1',
        point,
      }),
    );

    expect(mocks.sendLocation).not.toHaveBeenCalled();
    expect(mocks.sendLocationBatch).not.toHaveBeenCalled();
  });

  it.each(['solo-locked', 'group-locked'])('persists every accepted locked-screen callback in one React batch for %s', async (rideId) => {
    const hook = renderHook(() => {
      const sync = useRideLocationSync({ ...params, rideId });
      const tracker = useLocationTracker(false, sync.persistLocation);
      return { sync, tracker };
    });
    await act(async () => hook.result.current.tracker.startTracking());
    await act(async () => { await mocks.appStateCallback?.({ isActive: false }); });
    const rawPoints = Array.from({ length: 5 }, (_, index): LocationPoint => ({
      lat: 14.6 + index * 0.0002, lng: 121, speed: 4, accuracy: 6,
      timestamp: new Date(Date.now() - 20_000 + index * 5_000).toISOString(),
    }));
    await act(async () => {
      for (const raw of rawPoints) mocks.backgroundCallback?.(raw);
      mocks.backgroundCallback?.({ ...rawPoints[4], accuracy: 100 });
      await hook.result.current.sync.flushPendingLocations();
    });
    expect(hook.result.current.tracker.quality.acceptedCount).toBe(5);
    expect(hook.result.current.tracker.quality.rejectedCount).toBe(1);
    expect(mocks.persistAcceptedLocation).toHaveBeenCalledTimes(5);
    const persisted = mocks.persistAcceptedLocation.mock.calls.map(([record]) => record);
    expect(persisted.map((record) => record.point.lat)).toEqual(rawPoints.map((raw) => raw.lat));
    expect(new Set(persisted.map((record) => record.point.pointId)).size).toBe(5);
    for (const record of persisted) {
      expect(record).toMatchObject({ rideId, riderId: 'rider-1', enqueueForSync: false });
      expect(record.point).toMatchObject({ source: 'background', segmentId: expect.any(String) });
    }
    expect(mocks.sendLocation).not.toHaveBeenCalled();
    expect(mocks.sendLocationBatch).not.toHaveBeenCalled();
  });

  it('drains queued points in order and waits for the final local write', async () => {
    const releases: Array<() => void> = [];
    mocks.persistAcceptedLocation.mockImplementation(() => new Promise<void>((resolve) => { releases.push(resolve); }));
    const { result } = renderHook(() => useRideLocationSync(params));
    let drained = false;
    let drain!: Promise<void>;
    act(() => {
      result.current.persistLocation(point);
      result.current.persistLocation({ ...point, pointId: 'point-2' });
      drain = result.current.flushPendingLocations().then(() => { drained = true; });
    });
    expect(mocks.persistAcceptedLocation).toHaveBeenCalledOnce();
    expect(drained).toBe(false);
    await act(async () => { releases[0](); await Promise.resolve(); });
    expect(mocks.persistAcceptedLocation).toHaveBeenCalledTimes(2);
    expect(drained).toBe(false);
    await act(async () => { releases[1](); await drain; });
    expect(drained).toBe(true);
    expect(mocks.persistAcceptedLocation.mock.calls.map(([record]) => record.point.pointId)).toEqual([point.pointId, 'point-2']);
  });

  it('retains failed writes for retry and exposes drain failure to ride end', async () => {
    mocks.persistAcceptedLocation.mockRejectedValueOnce(new Error('Disk is full'));
    const { result } = renderHook(() => useRideLocationSync(params));
    await act(async () => {
      result.current.persistLocation(point);
      result.current.persistLocation({ ...point, pointId: 'point-2' });
      await expect(result.current.flushPendingLocations()).rejects.toThrow('Disk is full');
    });
    expect(result.current.persistenceError).toBe('Disk is full');
    expect(mocks.persistAcceptedLocation).toHaveBeenCalledOnce();
    await act(async () => { await result.current.flushPendingLocations(); });
    expect(mocks.persistAcceptedLocation.mock.calls.map(([record]) => record.point.pointId)).toEqual([point.pointId, point.pointId, 'point-2']);
    expect(result.current.persistenceError).toBeNull();
  });

  it('keeps queued points assigned to their original ride when the route changes', async () => {
    let release!: () => void;
    mocks.persistAcceptedLocation.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const hook = renderHook(({ rideId, riderId }) => useRideLocationSync({ ...params, rideId, riderId }), {
      initialProps: { rideId: 'ride-1', riderId: 'rider-1' },
    });
    act(() => hook.result.current.persistLocation(point));
    hook.rerender({ rideId: 'ride-2', riderId: 'rider-2' });
    act(() => hook.result.current.persistLocation({ ...point, pointId: 'point-2' }));
    await act(async () => { release(); await hook.result.current.flushPendingLocations(); });
    expect(mocks.persistAcceptedLocation.mock.calls.map(([record]) => [record.rideId, record.riderId])).toEqual([
      ['ride-1', 'rider-1'], ['ride-2', 'rider-2'],
    ]);
  });

  it('continues local recording while a live upload is blocked and clears its interval on unmount', async () => {
    let releaseUpload!: () => void;
    mocks.sendLocation.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseUpload = resolve; }));
    const hook = renderHook(() => useRideLocationSync({ ...params, isOnline: true }));
    await act(async () => {
      hook.result.current.persistLocation(point);
      await hook.result.current.flushPendingLocations();
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(mocks.sendLocation).toHaveBeenCalledOnce();
    await act(async () => {
      hook.result.current.persistLocation({ ...point, pointId: 'point-2' });
      await hook.result.current.flushPendingLocations();
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(mocks.persistAcceptedLocation).toHaveBeenCalledTimes(2);
    expect(mocks.sendLocation).toHaveBeenCalledOnce();
    await act(async () => { releaseUpload(); await Promise.resolve(); });
    hook.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(mocks.sendLocation).toHaveBeenCalledOnce();
  });
});
