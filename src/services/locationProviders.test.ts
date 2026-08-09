import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'web',
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
}));

vi.mock('@capacitor/geolocation', () => ({ Geolocation: mocks.geolocation }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: mocks.notifications,
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform },
  registerPlugin: () => mocks.background,
}));

import { ForegroundGeolocationProvider } from './ForegroundGeolocationProvider';
import { BackgroundGeolocationProvider } from './BackgroundGeolocationProvider';

describe('location providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform = 'web';
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

  it('requires Android notifications before starting the background watcher', async () => {
    mocks.platform = 'android';
    mocks.notifications.checkPermissions.mockResolvedValue({ display: 'prompt' });
    mocks.notifications.requestPermissions.mockResolvedValue({ display: 'denied' });

    await expect(new BackgroundGeolocationProvider().start()).rejects.toThrow(
      'Notification permission is required',
    );
    expect(mocks.background.addWatcher).not.toHaveBeenCalled();
  });

  it('uses a 5-meter native background filter and removes one watcher idempotently', async () => {
    const provider = new BackgroundGeolocationProvider();
    await provider.start();
    await provider.start();

    expect(mocks.background.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ distanceFilter: 5, stale: false }),
      expect.any(Function),
    );
    expect(mocks.background.addWatcher).toHaveBeenCalledTimes(1);

    provider.stop();
    provider.stop();
    expect(mocks.background.removeWatcher).toHaveBeenCalledOnce();
    expect(mocks.background.removeWatcher).toHaveBeenCalledWith({ id: 'background-watch' });
  });
});
