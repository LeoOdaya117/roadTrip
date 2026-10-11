import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/offlineDb', () => ({
  getSession: vi.fn(async () => undefined),
  getTrackPoints: vi.fn(async () => []),
  getPhotos: vi.fn(async () => []),
}));
vi.mock('../services/locationFilter', () => ({ calculateTrackDistanceMeters: () => 0 }));

import { fetchRideById } from './ride';

describe('fetchRideById', () => {
  afterEach(() => localStorage.clear());

  it('does not fabricate rides for unknown production ids', async () => {
    await expect(fetchRideById('solo-missing-ride')).rejects.toThrow('was not found on this device');
  });

  it('retains the explicitly documented demo1 sample ride', async () => {
    const ride = await fetchRideById('demo1');
    expect(ride.id).toBe('demo1');
    expect(ride.distanceMeters).toBeGreaterThan(0);
  });

  it('still reads an explicitly stored legacy ride for its id', async () => {
    const ride = { id: 'legacy-ride', distanceMeters: 1, durationSeconds: 2, startTimeISO: '', photoUrls: [], polylineGeoJSON: { type: 'LineString', coordinates: [] } };
    localStorage.setItem('ride:legacy-ride', JSON.stringify(ride));
    await expect(fetchRideById('legacy-ride')).resolves.toEqual(ride);
  });
});
