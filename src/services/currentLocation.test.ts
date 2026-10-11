import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentLocationFix } from './currentLocation';

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
  requestPermissions: vi.fn(),
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: mocks.checkPermissions,
    getCurrentPosition: mocks.getCurrentPosition,
    requestPermissions: mocks.requestPermissions,
  },
}));

describe('getCurrentLocationFix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPermissions.mockResolvedValue({ location: 'granted' });
    mocks.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 14.6, longitude: 121, speed: null, accuracy: 8 },
      timestamp: Date.parse('2026-10-08T00:00:00.000Z'),
    });
  });

  it('gets one fix and does not start a tracking watch', async () => {
    await expect(getCurrentLocationFix()).resolves.toMatchObject({ lat: 14.6, lng: 121, accuracy: 8 });
    expect(mocks.getCurrentPosition).toHaveBeenCalledOnce();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });

  it('reports denied permission without requesting a location fix', async () => {
    mocks.checkPermissions.mockResolvedValue({ location: 'denied' });
    mocks.requestPermissions.mockResolvedValue({ location: 'denied' });
    await expect(getCurrentLocationFix()).rejects.toThrow(/permission is needed/i);
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('requests permission before retrieving a fix when permission is prompted', async () => {
    mocks.checkPermissions.mockResolvedValue({ location: 'prompt' });
    mocks.requestPermissions.mockResolvedValue({ location: 'granted' });
    await expect(getCurrentLocationFix()).resolves.toMatchObject({ lat: 14.6, lng: 121 });
    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
  });
});
