import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationPoint } from '../types/ride';
import { useLocationTracker } from './useLocationTracker';

const mocks = vi.hoisted(() => ({
  foreground: {
    start: vi.fn(),
    stop: vi.fn(),
    onLocation: vi.fn(),
    getPermissionState: vi.fn(),
  },
  background: {
    start: vi.fn(),
    stop: vi.fn(),
    onLocation: vi.fn(),
    getPermissionState: vi.fn(),
  },
  foregroundCallback: null as ((point: LocationPoint) => void) | null,
  backgroundCallback: null as ((point: LocationPoint) => void) | null,
  getAppState: vi.fn(),
  addAppListener: vi.fn(),
}));

vi.mock('../services/LocationProviderFactory', () => ({
  createLocationProviders: () => ({
    foreground: mocks.foreground,
    background: mocks.background,
  }),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getState: mocks.getAppState,
    addListener: mocks.addAppListener,
  },
}));

const makePoint = (
  timestamp = Date.now(),
  overrides: Partial<LocationPoint> = {},
): LocationPoint => ({
  lat: 14.6,
  lng: 121,
  accuracy: 5,
  speed: 0,
  timestamp: new Date(timestamp).toISOString(),
  ...overrides,
});

const emit = (point: LocationPoint) => {
  if (!mocks.foregroundCallback) throw new Error('The foreground provider is not subscribed.');
  act(() => mocks.foregroundCallback?.(point));
};

const startTracker = async () => {
  const hook = renderHook(() => useLocationTracker());
  await act(async () => hook.result.current.startTracking());
  return hook;
};

describe('useLocationTracker raw-fix freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T00:00:00.000Z'));
    vi.clearAllMocks();
    mocks.foregroundCallback = null;
    mocks.backgroundCallback = null;
    mocks.getAppState.mockResolvedValue({ isActive: true });
    mocks.addAppListener.mockResolvedValue({ remove: vi.fn() });
    mocks.foreground.start.mockResolvedValue(undefined);
    mocks.foreground.stop.mockImplementation(() => undefined);
    mocks.foreground.getPermissionState.mockResolvedValue('granted');
    mocks.foreground.onLocation.mockImplementation((callback: (point: LocationPoint) => void) => {
      mocks.foregroundCallback = callback;
      return () => { mocks.foregroundCallback = null; };
    });
    mocks.background.start.mockResolvedValue(undefined);
    mocks.background.stop.mockImplementation(() => undefined);
    mocks.background.getPermissionState.mockResolvedValue('granted');
    mocks.background.onLocation.mockImplementation((callback: (point: LocationPoint) => void) => {
      mocks.backgroundCallback = callback;
      return () => { mocks.backgroundCallback = null; };
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('expires freshness after thirty seconds without a valid provider fix while retaining the accepted location', async () => {
    const { result } = await startTracker();
    emit(makePoint());
    const acceptedLocation = result.current.location;

    expect(result.current.hasFreshLocation).toBe(true);
    await act(async () => { vi.advanceTimersByTime(29_999); });
    expect(result.current.hasFreshLocation).toBe(true);

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(result.current.hasFreshLocation).toBe(false);
    expect(result.current.location).toBe(acceptedLocation);
  });

  it('refreshes liveness from valid stationary too-soon and too-close callbacks without replacing the accepted point', async () => {
    const { result } = await startTracker();
    emit(makePoint());
    const acceptedLocation = result.current.location;

    await act(async () => { vi.advanceTimersByTime(1_000); });
    emit(makePoint());
    expect(result.current.quality.lastRejectedReason).toBe('too-soon');

    await act(async () => { vi.advanceTimersByTime(9_000); });
    emit(makePoint());
    expect(result.current.quality.lastRejectedReason).toBe('too-close');
    expect(result.current.location).toBe(acceptedLocation);

    await act(async () => { vi.advanceTimersByTime(29_999); });
    expect(result.current.hasFreshLocation).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(result.current.hasFreshLocation).toBe(false);
  });

  it('does not extend freshness for invalid, stale, future, inaccurate, implausible, or out-of-order fixes', async () => {
    const { result } = await startTracker();
    emit(makePoint());
    await act(async () => { vi.advanceTimersByTime(29_999); });

    const now = Date.now();
    const invalidFixes: Array<[LocationPoint, string]> = [
      [makePoint(now, { lat: 91 }), 'invalid-coordinate'],
      [makePoint(now, { accuracy: -1 }), 'invalid-accuracy'],
      [makePoint(now, { timestamp: 'not-a-timestamp' }), 'invalid-timestamp'],
      [makePoint(now - 30_001), 'stale'],
      [makePoint(now + 10_001), 'future'],
      [makePoint(now, { accuracy: 51 }), 'inaccurate'],
      [makePoint(now, { speed: 71 }), 'implausible-speed'],
      [makePoint(now - 29_999), 'out-of-order'],
    ];

    for (const [point, rejectionReason] of invalidFixes) {
      emit(point);
      expect(result.current.quality.lastRejectedReason).toBe(rejectionReason);
    }

    emit(makePoint(now + 1_000));
    expect(result.current.quality.lastRejectedReason).toBe('too-close');

    expect(result.current.hasFreshLocation).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(result.current.hasFreshLocation).toBe(false);
  });

  it('clears freshness on pause and recovers after tracking resumes with a fresh stationary callback', async () => {
    const { result } = await startTracker();
    emit(makePoint());
    const acceptedLocation = result.current.location;
    expect(result.current.hasFreshLocation).toBe(true);

    await act(async () => { vi.advanceTimersByTime(10_000); });
    act(() => result.current.stopTracking());
    expect(result.current.isTracking).toBe(false);
    expect(result.current.hasFreshLocation).toBe(false);
    expect(result.current.location).toBe(acceptedLocation);

    await act(async () => result.current.startTracking());
    emit(makePoint());
    expect(result.current.quality.lastRejectedReason).toBe('too-close');
    expect(result.current.hasFreshLocation).toBe(true);
    expect(result.current.location).toBe(acceptedLocation);
  });

  it('recovers freshness from a valid stationary fix after the prior signal expires', async () => {
    const { result } = await startTracker();
    emit(makePoint());
    const acceptedLocation = result.current.location;

    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(result.current.hasFreshLocation).toBe(false);
    emit(makePoint());

    expect(result.current.quality.lastRejectedReason).toBe('too-close');
    expect(result.current.hasFreshLocation).toBe(true);
    expect(result.current.location).toBe(acceptedLocation);
  });
});
