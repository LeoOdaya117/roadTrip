import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeOutboxPoints,
  addPhoto,
  deleteSession,
  getDueOutboxBatch,
  getAllSessions,
  getLastLocation,
  getPendingOutboxCount,
  getPhotos,
  getTrackPoints,
  failOutboxPoints,
  pauseOutboxPointsForAuthentication,
  persistAcceptedLocation,
  rideDb,
  saveRideProgress,
  saveRideSession,
  updateRideSession,
} from './offlineDb';
import type { AcceptedLocationPoint } from '../types/ride';

const acceptedPoint = (
  pointId: string,
  segmentId = 'segment-a',
): AcceptedLocationPoint => ({
  pointId,
  segmentId,
  source: 'foreground',
  lat: 14.5995,
  lng: 120.9842,
  accuracy: 5,
  speed: 10,
  timestamp: '2026-08-09T00:00:00.000Z',
});

describe('rideDb v5 persistence', () => {
  beforeEach(async () => {
    rideDb.close();
    await Dexie.delete('rideTrackerDb');
    await rideDb.open();
  });

  afterEach(async () => {
    rideDb.close();
    await Dexie.delete('rideTrackerDb');
  });

  it('coalesces concurrent identical list reads but refreshes after completion', async () => {
    await saveRideSession({
      rideId: 'read-once',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      createdAt: '2026-08-09T00:00:00.000Z',
      status: 'active',
    });
    const orderBy = vi.spyOn(rideDb.sessions, 'orderBy');

    const [first, second] = await Promise.all([getAllSessions(), getAllSessions()]);

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(orderBy).toHaveBeenCalledTimes(1);
    await getAllSessions();
    expect(orderBy).toHaveBeenCalledTimes(2);
    orderBy.mockRestore();
  });

  it('keeps lifecycle state intact when a stale progress save completes after resume', async () => {
    const staleSnapshot = {
      rideId: 'resume-race',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      isSolo: true,
      createdAt: '2026-08-09T00:00:00.000Z',
      status: 'paused' as const,
      activeSegmentId: 'old-segment',
      durationSeconds: 10,
      distanceMeters: 25,
    };
    await saveRideSession({
      ...staleSnapshot,
      status: 'active',
      activeSegmentId: 'new-segment',
      durationSeconds: 12,
      distanceMeters: 30,
    });

    await saveRideProgress(staleSnapshot, 11, 28);

    expect(await rideDb.sessions.get('resume-race')).toMatchObject({
      status: 'active',
      activeSegmentId: 'new-segment',
      durationSeconds: 12,
      distanceMeters: 30,
    });
  });

  it('applies lifecycle patches without replacing session progress', async () => {
    await saveRideSession({
      rideId: 'lifecycle-patch',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      createdAt: '2026-08-09T00:00:00.000Z',
      durationSeconds: 42,
      distanceMeters: 500,
      activeSegmentId: 'segment-1',
    });

    await updateRideSession('lifecycle-patch', { status: 'paused' });

    expect(await rideDb.sessions.get('lifecycle-patch')).toMatchObject({
      status: 'paused',
      durationSeconds: 42,
      distanceMeters: 500,
      activeSegmentId: 'segment-1',
    });
  });

  it('atomically persists and deduplicates a group point with its outbox record', async () => {
    await saveRideSession({
      rideId: 'group-1',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      createdAt: '2026-08-09T00:00:00.000Z',
      status: 'active',
    });
    const point = acceptedPoint('point-1');
    await persistAcceptedLocation({
      rideId: 'group-1',
      riderId: 'rider-1',
      point,
      enqueueForSync: true,
    });
    await persistAcceptedLocation({
      rideId: 'group-1',
      riderId: 'rider-1',
      point,
      enqueueForSync: true,
    });

    expect(await getTrackPoints('group-1')).toHaveLength(1);
    expect(await getLastLocation('group-1')).toMatchObject({ pointId: 'point-1' });
    expect(await getPendingOutboxCount()).toBe(1);
    expect(await getDueOutboxBatch(Date.now())).toMatchObject([
      { pointId: 'point-1', rideId: 'group-1', riderId: 'rider-1' },
    ]);
  });

  it('persists solo tracks without creating upload work', async () => {
    await persistAcceptedLocation({
      rideId: 'solo-1',
      riderId: 'rider-1',
      point: acceptedPoint('solo-point'),
      enqueueForSync: false,
    });
    expect(await getTrackPoints('solo-1')).toHaveLength(1);
    expect(await getPendingOutboxCount()).toBe(0);
  });

  it('persists a navigation destination without changing legacy session compatibility', async () => {
    const legacySession = {
      rideId: 'solo-legacy',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      isSolo: true,
      createdAt: '2026-08-09T00:00:00.000Z',
    };
    await saveRideSession(legacySession);
    expect(await rideDb.sessions.get('solo-legacy')).toEqual(legacySession);

    const navigationDestination = { lat: 14.1, lng: 120.95, label: 'Tagaytay' };
    await saveRideSession({ ...legacySession, navigationDestination, navigationEnabled: true });
    expect(await rideDb.sessions.get('solo-legacy')).toMatchObject({
      navigationDestination,
      navigationEnabled: true,
    });
  });

  it('deletes all data owned by a ride', async () => {
    await saveRideSession({
      rideId: 'group-1',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      createdAt: '2026-08-09T00:00:00.000Z',
    });
    await persistAcceptedLocation({
      rideId: 'group-1',
      riderId: 'rider-1',
      point: acceptedPoint('point-1'),
      enqueueForSync: true,
    });
    await addPhoto({
      rideId: 'group-1',
      timestamp: '2026-08-09T00:00:00.000Z',
      data: new Blob(['photo']),
    });

    await deleteSession('group-1');
    expect(await getTrackPoints('group-1')).toHaveLength(0);
    expect(await getPhotos('group-1')).toHaveLength(0);
    expect(await getPendingOutboxCount()).toBe(0);
  });

  it('acknowledges only the explicitly accepted point IDs', async () => {
    for (const pointId of ['point-1', 'point-2']) {
      await persistAcceptedLocation({
        rideId: 'group-1',
        riderId: 'rider-1',
        point: acceptedPoint(pointId),
        enqueueForSync: true,
      });
    }
    await acknowledgeOutboxPoints(['point-1']);
    expect(await getPendingOutboxCount()).toBe(1);
    expect((await getDueOutboxBatch(Date.now()))[0].pointId).toBe('point-2');
  });

  it('limits due batches to 50 and retains them across a database restart', async () => {
    for (let index = 0; index < 51; index += 1) {
      await persistAcceptedLocation({
        rideId: 'group-1',
        riderId: 'rider-1',
        point: {
          ...acceptedPoint(`point-${index}`),
          timestamp: new Date(Date.parse('2026-08-09T00:00:00.000Z') + index).toISOString(),
        },
        enqueueForSync: true,
      });
    }
    rideDb.close();
    await rideDb.open();

    expect(await getDueOutboxBatch(Date.now(), 50)).toHaveLength(50);
    expect(await getPendingOutboxCount()).toBe(51);
  });

  it('keeps authentication-paused work visible and excludes permanent failures', async () => {
    for (const pointId of ['auth-point', 'bad-point']) {
      await persistAcceptedLocation({
        rideId: 'group-1',
        riderId: 'rider-1',
        point: acceptedPoint(pointId),
        enqueueForSync: true,
      });
    }
    const records = await getDueOutboxBatch(Date.now());
    await pauseOutboxPointsForAuthentication(
      records.filter((record) => record.pointId === 'auth-point'),
      'Unauthorized',
    );
    await failOutboxPoints([{ pointId: 'bad-point', reason: 'Invalid point' }]);

    expect(await getDueOutboxBatch(Date.now())).toHaveLength(0);
    expect(await getPendingOutboxCount()).toBe(1);
  });

  it('rolls back location and track writes when the outbox write fails', async () => {
    const outboxPut = vi.spyOn(rideDb.outbox, 'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(
      persistAcceptedLocation({
        rideId: 'group-rollback',
        riderId: 'rider-1',
        point: acceptedPoint('rollback-point'),
        enqueueForSync: true,
      }),
    ).rejects.toThrow('disk full');
    outboxPut.mockRestore();

    expect(await getLastLocation('group-rollback')).toBeUndefined();
    expect(await getTrackPoints('group-rollback')).toHaveLength(0);
  });
});

describe('rideDb migration', () => {
  it.each([1, 2, 3, 4])('opens and upgrades a v%s database', async (legacyVersion) => {
    rideDb.close();
    await Dexie.delete('rideTrackerDb');
    const legacy = new Dexie('rideTrackerDb');
    legacy.version(legacyVersion).stores({
      sessions: legacyVersion >= 3 ? 'rideId, createdAt' : 'rideId',
      locations: 'rideId',
      ...(legacyVersion >= 2 ? { tracks: '++id, rideId' } : {}),
      ...(legacyVersion >= 4 ? { photos: '++id, rideId, timestamp' } : {}),
    });
    if (legacyVersion >= 2) {
      await legacy.table('tracks').add({
        rideId: 'legacy-ride',
        lat: 14.5,
        lng: 121,
        accuracy: 10,
        speed: null,
        timestamp: '2025-01-01T00:00:00.000Z',
      });
    }
    legacy.close();

    await rideDb.open();
    expect(rideDb.verno).toBe(5);
    if (legacyVersion >= 2) {
      const [migrated] = await getTrackPoints('legacy-ride');
      expect(migrated).toMatchObject({
        pointId: 'legacy-legacy-ride-1',
        segmentId: 'legacy-legacy-ride',
        source: 'foreground',
      });
    }
    rideDb.close();
    await Dexie.delete('rideTrackerDb');
  });
});
