import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcceptedLocationPoint } from '../types/ride';

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

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

import { useRideLocationSync } from './useRideLocationSync';

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
    mocks.persistAcceptedLocation.mockResolvedValue(undefined);
    mocks.getLastLocation.mockResolvedValue(undefined);
    mocks.getPendingOutboxCount.mockResolvedValue(0);
    mocks.getDueOutboxBatch.mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('persists accepted background points locally while offline without attempting upload', async () => {
    renderHook(() => useRideLocationSync({
      rideId: 'group-offline-ride',
      riderId: 'rider-1',
      isTracking: true,
      isOnline: false,
      isSoloMode: false,
      location: point,
    }));

    await waitFor(() => expect(mocks.persistAcceptedLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        rideId: 'group-offline-ride',
        riderId: 'rider-1',
        point,
      }),
    ));

    expect(mocks.sendLocation).not.toHaveBeenCalled();
    expect(mocks.sendLocationBatch).not.toHaveBeenCalled();
  });
});
