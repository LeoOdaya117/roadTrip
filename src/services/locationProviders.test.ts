import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  platform: 'web',
  app: {
    getState: vi.fn(),
  },
  geolocation: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  },
  background: {
    addWatcher: vi.fn(),
    removeWatcher: vi.fn(),
  },
  notifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
  },
  androidBackgroundPermission: {
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({ App: mocks.app }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: mocks.geolocation }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: mocks.notifications,
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform },
  registerPlugin: (name: string) =>
    name === 'AndroidBackgroundLocationPermission'
      ? mocks.androidBackgroundPermission
      : mocks.background,
}));

import { ForegroundGeolocationProvider } from './ForegroundGeolocationProvider';
import { BackgroundGeolocationProvider } from './BackgroundGeolocationProvider';

describe('location providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform = 'web';
    mocks.app.getState.mockResolvedValue({ isActive: true });
    mocks.geolocation.checkPermissions.mockResolvedValue({ location: 'granted' });
    mocks.geolocation.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 14.5, longitude: 121, speed: null, accuracy: 8 },
      timestamp: 1_700_000_000_000,
    });
    mocks.geolocation.watchPosition.mockResolvedValue('foreground-watch');
    mocks.geolocation.clearWatch.mockResolvedValue(undefined);
    mocks.background.addWatcher.mockResolvedValue('background-watch');
    mocks.background.removeWatcher.mockResolvedValue(undefined);
    mocks.notifications.checkPermissions.mockResolvedValue({ display: 'granted' });
    mocks.notifications.requestPermissions.mockResolvedValue({ display: 'granted' });
    mocks.androidBackgroundPermission.checkPermission.mockResolvedValue({ granted: true });
    mocks.androidBackgroundPermission.requestPermission.mockResolvedValue({ granted: true });
  });

  it('normalizes foreground fixes, uses production watch options, and cleans up once', async () => {
    const provider = new ForegroundGeolocationProvider();
    const listener = vi.fn();
    provider.onLocation(listener);

    await provider.start();
    await provider.start();

    expect(listener).toHaveBeenCalledWith({
      lat: 14.5,
      lng: 121,
      speed: null,
      accuracy: 8,
      timestamp: new Date(1_700_000_000_000).toISOString(),
    });
    expect(mocks.geolocation.watchPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        enableHighAccuracy: true,
        maximumAge: 0,
        minimumUpdateInterval: 2000,
        timeout: 5000,
      }),
      expect.any(Function),
    );
    expect(mocks.geolocation.watchPosition).toHaveBeenCalledTimes(1);

    provider.stop();
    provider.stop();
    expect(mocks.geolocation.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('requests supported foreground permissions and exposes denial', async () => {
    mocks.geolocation.checkPermissions.mockResolvedValue({ location: 'prompt' });
    mocks.geolocation.requestPermissions.mockResolvedValue({ location: 'denied' });
    await expect(new ForegroundGeolocationProvider().start()).rejects.toThrow(
      'Location permission not granted',
    );
    expect(mocks.geolocation.requestPermissions).toHaveBeenCalledWith({
      permissions: ['location', 'coarseLocation'],
    });
  });

  it('recovers after foreground location permission is granted', async () => {
    mocks.geolocation.checkPermissions
      .mockResolvedValueOnce({ location: 'prompt' })
      .mockResolvedValueOnce({ location: 'granted' });
    mocks.geolocation.requestPermissions
      .mockResolvedValueOnce({ location: 'denied' })
      .mockResolvedValueOnce({ location: 'granted' });
    const provider = new ForegroundGeolocationProvider();

    await expect(provider.start()).rejects.toThrow('Location permission not granted');
    await provider.start();

    expect(mocks.geolocation.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.geolocation.watchPosition).toHaveBeenCalledOnce();
  });

  it('accepts approximate location when precise location is denied', async () => {
    mocks.geolocation.checkPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'granted',
    });
    const provider = new ForegroundGeolocationProvider();

    await provider.start();

    expect(mocks.geolocation.requestPermissions).not.toHaveBeenCalled();
    expect(await provider.getPermissionState()).toBe('granted');
    expect(mocks.geolocation.watchPosition).toHaveBeenCalledOnce();
  });

  it('accepts an approximate-only result from the foreground permission request', async () => {
    mocks.geolocation.checkPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'prompt',
    });
    mocks.geolocation.requestPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'granted',
    });

    await new ForegroundGeolocationProvider().start();

    expect(mocks.geolocation.watchPosition).toHaveBeenCalledOnce();
  });

  it('requests notification permission during active preparation and surfaces denial', async () => {
    mocks.platform = 'android';
    mocks.notifications.checkPermissions.mockResolvedValue({ display: 'prompt' });
    mocks.notifications.requestPermissions.mockResolvedValue({ display: 'denied' });

    await expect(
      new BackgroundGeolocationProvider().prepareForBackgroundTracking(),
    ).rejects.toThrow('Notification permission is needed for background tracking');
    expect(mocks.notifications.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.androidBackgroundPermission.checkPermission).not.toHaveBeenCalled();
    expect(mocks.background.addWatcher).not.toHaveBeenCalled();
  });

  it('recovers after Android notification permission is granted in Settings', async () => {
    mocks.platform = 'android';
    mocks.notifications.checkPermissions
      .mockResolvedValueOnce({ display: 'prompt' })
      .mockResolvedValueOnce({ display: 'granted' });
    mocks.notifications.requestPermissions.mockResolvedValue({ display: 'denied' });
    const provider = new BackgroundGeolocationProvider();

    await expect(provider.prepareForBackgroundTracking()).rejects.toThrow(
      'Notification permission is needed for background tracking',
    );
    await provider.prepareForBackgroundTracking();

    expect(mocks.notifications.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.androidBackgroundPermission.checkPermission).toHaveBeenCalledOnce();
  });

  it('requests and accepts Android background permission during preparation', async () => {
    mocks.platform = 'android';
    mocks.androidBackgroundPermission.checkPermission.mockResolvedValue({ granted: false });

    await new BackgroundGeolocationProvider().prepareForBackgroundTracking();

    expect(mocks.notifications.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.androidBackgroundPermission.checkPermission).toHaveBeenCalledOnce();
    expect(mocks.androidBackgroundPermission.requestPermission).toHaveBeenCalledOnce();
    expect(mocks.background.addWatcher).not.toHaveBeenCalled();
  });

  it('allows retry after Android background permission is denied', async () => {
    mocks.platform = 'android';
    mocks.androidBackgroundPermission.checkPermission
      .mockResolvedValueOnce({ granted: false })
      .mockResolvedValueOnce({ granted: true });
    mocks.androidBackgroundPermission.requestPermission.mockResolvedValue({ granted: false });
    const provider = new BackgroundGeolocationProvider();

    await expect(provider.prepareForBackgroundTracking()).rejects.toThrow(
      'Background location is needed to track while the screen is locked',
    );
    mocks.androidBackgroundPermission.requestPermission.mockResolvedValue({ granted: true });
    await provider.prepareForBackgroundTracking();

    expect(mocks.androidBackgroundPermission.requestPermission).toHaveBeenCalledOnce();
    expect(mocks.androidBackgroundPermission.checkPermission).toHaveBeenCalledTimes(2);
  });

  it('does not prompt for permissions when preparation is called while inactive', async () => {
    mocks.platform = 'android';
    mocks.app.getState.mockResolvedValue({ isActive: false });

    await expect(
      new BackgroundGeolocationProvider().prepareForBackgroundTracking(),
    ).rejects.toThrow('while the app is active');
    expect(mocks.notifications.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.androidBackgroundPermission.requestPermission).not.toHaveBeenCalled();
  });

  it('does not prompt or start the watcher when Android notification permission is missing', async () => {
    mocks.platform = 'android';
    mocks.notifications.checkPermissions.mockResolvedValue({ display: 'denied' });

    await expect(new BackgroundGeolocationProvider().start()).rejects.toThrow(
      'Enable notifications for RoadTrip in Android Settings',
    );
    expect(mocks.notifications.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.androidBackgroundPermission.requestPermission).not.toHaveBeenCalled();
    expect(mocks.background.addWatcher).not.toHaveBeenCalled();
  });

  it('does not prompt or start the watcher when Android background permission is missing', async () => {
    mocks.platform = 'android';
    mocks.androidBackgroundPermission.checkPermission.mockResolvedValue({ granted: false });

    await expect(new BackgroundGeolocationProvider().start()).rejects.toThrow(
      'Allow RoadTrip background location in Android Settings',
    );
    expect(mocks.notifications.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.androidBackgroundPermission.requestPermission).not.toHaveBeenCalled();
    expect(mocks.background.addWatcher).not.toHaveBeenCalled();
  });

  it('uses a 5-meter native background filter and removes one watcher idempotently', async () => {
    const provider = new BackgroundGeolocationProvider();
    await provider.start();
    await provider.start();

    expect(mocks.background.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceFilter: 5,
        stale: false,
        requestPermissions: false,
      }),
      expect.any(Function),
    );
    expect(mocks.background.addWatcher).toHaveBeenCalledTimes(1);

    provider.stop();
    provider.stop();
    expect(mocks.background.removeWatcher).toHaveBeenCalledOnce();
    expect(mocks.background.removeWatcher).toHaveBeenCalledWith({ id: 'background-watch' });
  });

  const providers = [
    { name: 'foreground', create: () => new ForegroundGeolocationProvider(), register: mocks.geolocation.watchPosition, remove: mocks.geolocation.clearWatch },
    { name: 'background', create: () => new BackgroundGeolocationProvider(), register: mocks.background.addWatcher, remove: mocks.background.removeWatcher },
  ];

  it.each(providers)('$name concurrent starts register only one native watcher', async ({ create, register }) => {
    mocks.platform = 'android';
    const provider = create();
    await Promise.all([provider.start(), provider.start(), provider.start()]);
    expect(register).toHaveBeenCalledOnce();
    provider.stop();
  });

  it.each(providers)('$name removes a late watcher after stop and suppresses cancelled callbacks', async ({ name, create, register, remove }) => {
    mocks.platform = 'android';
    let finishRegistration: ((id: string) => void) | undefined;
    register.mockImplementationOnce(() => new Promise<string>((resolve) => { finishRegistration = resolve; }));
    const provider = create();
    const listener = vi.fn();
    provider.onLocation(listener);
    const startup = provider.start();
    await waitFor(() => expect(register).toHaveBeenCalledOnce());
    listener.mockClear();
    provider.stop();
    const callback = register.mock.calls[0][1];
    callback(name === 'foreground'
      ? { coords: { latitude: 14.6, longitude: 121.1, speed: null, accuracy: 8 }, timestamp: 1_700_000_001_000 }
      : { latitude: 14.6, longitude: 121.1, speed: null, accuracy: 8, time: 1_700_000_001_000 });
    expect(listener).not.toHaveBeenCalled();
    finishRegistration?.('late-watch');
    await startup;
    expect(remove).toHaveBeenCalledWith({ id: 'late-watch' });
    provider.stop();
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each(providers)('$name waits for cancelled startup cleanup before owning a new watcher', async ({ create, register, remove }) => {
    mocks.platform = 'android';
    let finishRegistration: ((id: string) => void) | undefined;
    register.mockImplementationOnce(() => new Promise<string>((resolve) => { finishRegistration = resolve; }));
    register.mockResolvedValueOnce('new-watch');
    const provider = create();
    const first = provider.start();
    await waitFor(() => expect(register).toHaveBeenCalledOnce());
    provider.stop();
    const restart = provider.start();
    const duplicateRestart = provider.start();
    expect(register).toHaveBeenCalledOnce();
    finishRegistration?.('cancelled-watch');
    await Promise.all([first, restart, duplicateRestart]);
    expect(register).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith({ id: 'cancelled-watch' });
    provider.stop();
    expect(remove).toHaveBeenLastCalledWith({ id: 'new-watch' });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('does not deliver a foreground immediate fix or register a watch after cancellation', async () => {
    let finishFix: ((point: unknown) => void) | undefined;
    mocks.geolocation.getCurrentPosition.mockImplementationOnce(() => new Promise((resolve) => { finishFix = resolve; }));
    const provider = new ForegroundGeolocationProvider();
    const listener = vi.fn();
    provider.onLocation(listener);
    const startup = provider.start();
    await waitFor(() => expect(mocks.geolocation.getCurrentPosition).toHaveBeenCalledOnce());
    provider.stop();
    finishFix?.({ coords: { latitude: 14.6, longitude: 121.1 }, timestamp: 1_700_000_001_000 });
    await startup;
    expect(listener).not.toHaveBeenCalled();
    expect(mocks.geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it.each(providers)('$name reports cleanup failure without leaking location payloads', async ({ create, remove }) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      remove.mockRejectedValueOnce(new Error('private coordinate payload'));
      const provider = create();
      await provider.start();
      provider.stop();
      await waitFor(() => expect(warning).toHaveBeenCalledOnce());
      expect(warning.mock.calls[0]).toHaveLength(1);
      expect(warning.mock.calls[0][0]).not.toContain('private coordinate');
      await provider.start();
      provider.stop();
    } finally {
      warning.mockRestore();
    }
  });
});
