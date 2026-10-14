import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationPoint } from '../types/ride';
import { useLocationTracker } from './useLocationTracker';

const mocks = vi.hoisted(() => ({
  platform: 'web',
  prepareLocationPermissions: vi.fn(),
  foreground: {
    start: vi.fn(),
    stop: vi.fn(),
    onLocation: vi.fn(),
    getPermissionState: vi.fn(),
    prepareForBackgroundTracking: vi.fn(),
  },
  background: {
    start: vi.fn(),
    stop: vi.fn(),
    onLocation: vi.fn(),
    getPermissionState: vi.fn(),
    prepareForBackgroundTracking: vi.fn(),
  },
  foregroundCallback: null as ((point: LocationPoint) => void) | null,
  backgroundCallback: null as ((point: LocationPoint) => void) | null,
  getAppState: vi.fn(),
  addAppListener: vi.fn(),
  removeAppListener: vi.fn(),
  appStateCallback: null as ((state: { isActive: boolean }) => void | Promise<void>) | null,
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
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform, isNativePlatform: () => mocks.platform !== 'web' },
}));
vi.mock('../services/locationPermissions', () => ({
  prepareLocationPermissions: mocks.prepareLocationPermissions,
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
    mocks.platform = 'web';
    mocks.prepareLocationPermissions.mockReset().mockResolvedValue(undefined);
    mocks.foregroundCallback = null;
    mocks.backgroundCallback = null;
    mocks.appStateCallback = null;
    mocks.getAppState.mockResolvedValue({ isActive: true });
    mocks.removeAppListener.mockReset();
    mocks.addAppListener.mockImplementation((_event: string, callback: (state: { isActive: boolean }) => void | Promise<void>) => {
      mocks.appStateCallback = callback;
      return Promise.resolve({ remove: mocks.removeAppListener });
    });
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
    mocks.background.prepareForBackgroundTracking.mockResolvedValue(undefined);
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

  it('switches to the background provider while inactive and returns to one foreground provider on resume', async () => {
    const hook = await startTracker();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.appStateCallback).toBeTypeOf('function');

    await act(async () => { await mocks.appStateCallback?.({ isActive: false }); });
    expect(mocks.foreground.stop).toHaveBeenCalledOnce();
    expect(mocks.background.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isTracking).toBe(true);

    await act(async () => { await mocks.appStateCallback?.({ isActive: true }); });
    expect(mocks.background.stop).toHaveBeenCalledOnce();
    expect(mocks.foreground.start).toHaveBeenCalledTimes(2);
    expect(hook.result.current.isTracking).toBe(true);

    hook.unmount();
    expect(mocks.removeAppListener).toHaveBeenCalledOnce();
    expect(mocks.foreground.stop).toHaveBeenCalledTimes(2);
  });

  it('prepares Android background permissions while active and keeps foreground tracking available after denial', async () => {
    mocks.platform = 'android';
    mocks.prepareLocationPermissions.mockRejectedValueOnce(
      new Error('Background location is not enabled.'),
    );

    const { result } = renderHook(() => useLocationTracker());
    await act(async () => result.current.startTracking());

    expect(mocks.prepareLocationPermissions).toHaveBeenCalledOnce();
    expect(mocks.background.start).not.toHaveBeenCalled();
    expect(mocks.foreground.start).toHaveBeenCalledOnce();
    expect(result.current.isTracking).toBe(true);
    expect(result.current.error).toBe('Background location is not enabled.');
    expect(mocks.prepareLocationPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.foreground.start.mock.invocationCallOrder[0],
    );
  });

  it('keeps the background permission failure visible after restoring foreground tracking', async () => {
    mocks.platform = 'android';
    mocks.prepareLocationPermissions.mockRejectedValueOnce(
      new Error('Notification access is required.'),
    );

    const hook = renderHook(() => useLocationTracker());
    await act(async () => hook.result.current.startTracking());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await mocks.appStateCallback?.({ isActive: false }); });
    expect(hook.result.current.isTracking).toBe(false);
    await act(async () => { await mocks.appStateCallback?.({ isActive: true }); });

    expect(hook.result.current.isTracking).toBe(true);
    expect(hook.result.current.error).toBe('Notification access is required.');
    expect(mocks.prepareLocationPermissions).toHaveBeenCalledOnce();
    expect(mocks.background.start).not.toHaveBeenCalled();

    await act(async () => hook.result.current.startTracking());
    expect(mocks.prepareLocationPermissions).toHaveBeenCalledTimes(2);
    expect(hook.result.current.error).toBeNull();
  });

  it.each(['stop', 'unmount'] as const)(
    'does not restart foreground tracking when permission preparation resolves after %s',
    async (cancel) => {
      mocks.platform = 'android';
      let resolvePreparation!: () => void;
      let markPreparationStarted!: () => void;
      const preparationStarted = new Promise<void>((resolve) => {
        markPreparationStarted = resolve;
      });
      mocks.prepareLocationPermissions.mockImplementationOnce(() => {
        markPreparationStarted();
        return new Promise<void>((resolve) => { resolvePreparation = resolve; });
      });

      const hook = renderHook(() => useLocationTracker());
      let startPromise!: Promise<void>;
      await act(async () => {
        startPromise = hook.result.current.startTracking();
        await preparationStarted;
      });

      if (cancel === 'stop') {
        act(() => hook.result.current.stopTracking());
      } else {
        hook.unmount();
      }
      await act(async () => {
        resolvePreparation();
        await startPromise;
      });

      expect(mocks.foreground.start).not.toHaveBeenCalled();
      expect(mocks.background.start).not.toHaveBeenCalled();
      if (cancel === 'stop') expect(hook.result.current.isTracking).toBe(false);
    },
  );

  it('does not stop the next session watcher when an old session start resolves late', async () => {
    let finishOldStart!: () => void;
    mocks.foreground.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finishOldStart = resolve; }));
    const oldSession = renderHook(() => useLocationTracker());
    let oldStart!: Promise<void>;
    await act(async () => {
      oldStart = oldSession.result.current.startTracking();
      await Promise.resolve();
    });
    oldSession.unmount();
    expect(mocks.foreground.stop).toHaveBeenCalledOnce();
    const nextSession = await startTracker();
    expect(nextSession.result.current.isTracking).toBe(true);
    await act(async () => { finishOldStart(); await oldStart; });
    expect(mocks.foreground.stop).toHaveBeenCalledOnce();
    expect(nextSession.result.current.isTracking).toBe(true);
    nextSession.unmount();
    expect(mocks.foreground.stop).toHaveBeenCalledTimes(2);
  });

  it('does not restart a stopped watcher after later app-state changes', async () => {
    const hook = await startTracker();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await mocks.appStateCallback?.({ isActive: false }); });
    await act(async () => { await mocks.appStateCallback?.({ isActive: true }); });

    act(() => hook.result.current.stopTracking());
    await act(async () => { await mocks.appStateCallback?.({ isActive: false }); });
    await act(async () => { await mocks.appStateCallback?.({ isActive: true }); });

    expect(mocks.background.start).toHaveBeenCalledOnce();
    expect(mocks.foreground.start).toHaveBeenCalledTimes(2);
    expect(hook.result.current.isTracking).toBe(false);
  });

  it('arms one Android service while active and retains its filter baseline across lock and resume', async () => {
    mocks.platform = 'android';
    const accepted = vi.fn();
    const hook = renderHook(() => useLocationTracker(false, accepted));
    await act(async () => hook.result.current.startTracking());
    expect(mocks.background.start).toHaveBeenCalledOnce();
    expect(mocks.foreground.start).not.toHaveBeenCalled();
    expect(mocks.prepareLocationPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.background.start.mock.invocationCallOrder[0],
    );
    act(() => mocks.backgroundCallback?.(makePoint(Date.now(), { speed: 4 })));
    expect(accepted.mock.calls[0][0].source).toBe('foreground');
    await act(async () => { await mocks.appStateCallback?.({ isActive: false }); });
    act(() => mocks.backgroundCallback?.(makePoint()));
    expect(accepted).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(5_000);
      mocks.backgroundCallback?.(makePoint(Date.now(), { lat: 14.6002, speed: 4 }));
    });
    expect(accepted.mock.calls[1][0].source).toBe('background');
    await act(async () => { await mocks.appStateCallback?.({ isActive: true }); });
    expect(mocks.background.start).toHaveBeenCalledOnce();
    expect(mocks.background.stop).not.toHaveBeenCalled();
    expect(mocks.foreground.start).not.toHaveBeenCalled();
    expect(mocks.prepareLocationPermissions).toHaveBeenCalledOnce();
    hook.unmount();
    expect(mocks.background.stop).toHaveBeenCalledOnce();
    expect(mocks.backgroundCallback).toBeNull();
    expect(mocks.removeAppListener).toHaveBeenCalledOnce();
  });

  it('cleans a late Android watcher start after tracking was stopped', async () => {
    mocks.platform = 'android';
    let resolveStart!: () => void;
    mocks.background.start.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const accepted = vi.fn();
    const hook = renderHook(() => useLocationTracker(false, accepted));
    let starting!: Promise<void>;
    await act(async () => {
      starting = hook.result.current.startTracking();
      for (let step = 0; step < 8; step += 1) await Promise.resolve();
    });
    expect(mocks.background.start).toHaveBeenCalledOnce();
    const staleCallback = mocks.backgroundCallback;
    act(() => hook.result.current.stopTracking());
    act(() => staleCallback?.(makePoint()));
    expect(accepted).not.toHaveBeenCalled();
    await act(async () => { resolveStart(); await starting; });
    expect(mocks.background.stop).toHaveBeenCalledOnce();
    expect(mocks.backgroundCallback).toBeNull();
    expect(hook.result.current.isTracking).toBe(false);
  });

  it('does not restore tracking when a permission-state read finishes after stop', async () => {
    mocks.platform = 'android';
    let resolvePermission!: (state: string) => void;
    mocks.background.getPermissionState.mockImplementationOnce(() => new Promise<string>((resolve) => { resolvePermission = resolve; }));
    const hook = renderHook(() => useLocationTracker());
    let starting!: Promise<void>;
    await act(async () => {
      starting = hook.result.current.startTracking();
      for (let step = 0; step < 10; step += 1) await Promise.resolve();
    });
    expect(mocks.background.getPermissionState).toHaveBeenCalledOnce();
    act(() => hook.result.current.stopTracking());
    await act(async () => { resolvePermission('granted'); await starting; });
    expect(hook.result.current.isTracking).toBe(false);
    expect(mocks.backgroundCallback).toBeNull();
    expect(mocks.background.stop).toHaveBeenCalledOnce();
  });
});
