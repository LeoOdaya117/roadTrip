import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureForegroundLocationPermission,
  hasFinishedLocationPermissionSetup,
  PERMISSION_SETUP_KEY,
  prepareLocationPermissions,
  saveLocationPermissionSetup,
  LocationServicesDisabledError,
} from './locationPermissions';

const mocks = vi.hoisted(() => ({
  native: true,
  platform: 'android',
  check: vi.fn(),
  request: vi.fn(),
  prepare: vi.fn(),
  start: vi.fn(),
  fix: vi.fn(),
  appState: vi.fn(),
  services: vi.fn(),
  settings: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  isNativePlatform: () => mocks.native,
  getPlatform: () => mocks.platform,
}, registerPlugin: () => ({ checkLocationServices: mocks.services, openLocationSettings: mocks.settings }) }));
vi.mock('@capacitor/app', () => ({ App: { getState: mocks.appState } }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: {
  checkPermissions: mocks.check,
  requestPermissions: mocks.request,
  getCurrentPosition: mocks.fix,
  watchPosition: mocks.start,
} }));
vi.mock('./LocationProviderFactory', () => ({ createLocationProviders: () => ({
  foreground: { start: mocks.start },
  background: { prepareForBackgroundTracking: mocks.prepare, start: mocks.start },
}) }));

describe('location permission preparation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.native = true;
    mocks.platform = 'android';
    mocks.appState.mockResolvedValue({ isActive: true });
    mocks.services.mockResolvedValue({ enabled: true });
    mocks.settings.mockResolvedValue({ enabled: true });
    mocks.check.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    mocks.request.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    mocks.prepare.mockResolvedValue(undefined);
    localStorage.removeItem(PERMISSION_SETUP_KEY);
  });

  it('requests foreground permission before background setup without acquiring a location', async () => {
    await prepareLocationPermissions();
    expect(mocks.request).toHaveBeenCalledWith({ permissions: ['location', 'coarseLocation'] });
    expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.fix).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.services.mock.invocationCallOrder[0]).toBeLessThan(mocks.check.mock.invocationCallOrder[0]);
  });

  it('opens Android location settings before checking permissions when GPS is off', async () => {
    mocks.services.mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: true });
    await prepareLocationPermissions();
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.settings.mock.invocationCallOrder[0]).toBeLessThan(mocks.check.mock.invocationCallOrder[0]);
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it('reports cancelled GPS settings without prompting and permits explicit retry', async () => {
    mocks.services.mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: false });
    await expect(prepareLocationPermissions()).rejects.toBeInstanceOf(LocationServicesDisabledError);
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    mocks.check.mockResolvedValue({ location: 'granted' });
    await prepareLocationPermissions();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('deduplicates GPS-off settings requests and rechecks actual services on return', async () => {
    mocks.services.mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: false });
    const results = await Promise.allSettled([prepareLocationPermissions(), prepareLocationPermissions()]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.services).toHaveBeenCalledTimes(2);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('does not open OS settings or permission prompts while inactive', async () => {
    mocks.appState.mockResolvedValue({ isActive: false });
    await expect(prepareLocationPermissions()).rejects.toThrow('Open RoadTrip');
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('does not request permissions if the app becomes inactive after settings', async () => {
    mocks.services.mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: true });
    mocks.appState.mockResolvedValueOnce({ isActive: true }).mockResolvedValueOnce({ isActive: true }).mockResolvedValueOnce({ isActive: false });
    await expect(prepareLocationPermissions()).rejects.toThrow('Open RoadTrip');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('accepts approximate location without requesting foreground permission again', async () => {
    mocks.check.mockResolvedValue({ location: 'denied', coarseLocation: 'granted' });
    await prepareLocationPermissions();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent startup and setup calls', async () => {
    await Promise.all([prepareLocationPermissions(), prepareLocationPermissions(), ensureForegroundLocationPermission()]);
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it('stops on denial and allows a later retry', async () => {
    mocks.request.mockResolvedValueOnce({ location: 'denied', coarseLocation: 'denied' });
    await expect(prepareLocationPermissions()).rejects.toThrow('Location permission is needed');
    expect(mocks.prepare).not.toHaveBeenCalled();
    await prepareLocationPermissions();
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it('propagates background denial and permits retry', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('Notifications denied'));
    await expect(prepareLocationPermissions()).rejects.toThrow('Notifications denied');
    await prepareLocationPermissions();
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });

  it.each(['web', 'ios'])('does not run native Android setup on %s', async (platform) => {
    mocks.platform = platform;
    mocks.native = platform !== 'web';
    await prepareLocationPermissions();
    await ensureForegroundLocationPermission();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('recognizes only completed/skipped markers and handles unavailable storage', () => {
    expect(hasFinishedLocationPermissionSetup()).toBe(false);
    localStorage.setItem(PERMISSION_SETUP_KEY, 'bad-data');
    expect(hasFinishedLocationPermissionSetup()).toBe(false);
    saveLocationPermissionSetup('completed');
    expect(hasFinishedLocationPermissionSetup()).toBe(true);
    saveLocationPermissionSetup('skipped');
    expect(hasFinishedLocationPermissionSetup()).toBe(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(hasFinishedLocationPermissionSetup()).toBe(false);
    expect(() => saveLocationPermissionSetup('skipped')).not.toThrow();
  });
});
