import Dexie, { type Table } from 'dexie';
import type {
  AcceptedLocationPoint,
  LocationPoint,
  LocationSource,
  PhotoRecord,
  RideSession,
} from '../types/ride';
import { createSingleFlight } from './singleFlight';

type LocationRecord = LocationPoint & {
  rideId: string;
  pointId?: string;
  segmentId?: string;
  source?: LocationSource;
};

export type TrackPoint = LocationPoint & {
  rideId: string;
  id?: number;
  pointId: string;
  segmentId: string;
  source: LocationSource;
};

export type LocationOutboxStatus = 'pending' | 'failed' | 'authentication-required';

export type LocationOutboxRecord = AcceptedLocationPoint & {
  rideId: string;
  riderId: string;
  status: LocationOutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: string;
  failureReason?: string;
};

type LegacyTrackPoint = LocationPoint & {
  rideId: string;
  id?: number;
  pointId?: string;
  segmentId?: string;
  source?: LocationSource;
};

class RideDb extends Dexie {
  sessions!: Table<RideSession, string>;
  locations!: Table<LocationRecord, string>;
  tracks!: Table<TrackPoint, number>;
  photos!: Table<PhotoRecord, number>;
  outbox!: Table<LocationOutboxRecord, string>;

  constructor() {
    super('rideTrackerDb');
    this.version(1).stores({
      sessions: 'rideId',
      locations: 'rideId',
    });
    this.version(2).stores({
      sessions: 'rideId',
      locations: 'rideId',
      tracks: '++id, rideId',
    });
    this.version(3).stores({
      sessions: 'rideId, createdAt',
      locations: 'rideId',
      tracks: '++id, rideId',
    });
    this.version(4).stores({
      sessions: 'rideId, createdAt',
      locations: 'rideId',
      tracks: '++id, rideId',
      photos: '++id, rideId, timestamp',
    });
    this.version(5)
      .stores({
        sessions: 'rideId, createdAt, status',
        locations: 'rideId',
        tracks: '++id, rideId, timestamp, &pointId, segmentId',
        photos: '++id, rideId, timestamp',
        outbox: '&pointId, rideId, status, nextAttemptAt, timestamp',
      })
      .upgrade(async (transaction) => {
        const tracks = transaction.table<LegacyTrackPoint, number>('tracks');
        let legacyIndex = 0;
        await tracks.toCollection().modify((track) => {
          const primaryKey = String(track.id ?? legacyIndex);
          legacyIndex += 1;
          track.pointId ??= `legacy-${track.rideId}-${primaryKey}`;
          track.segmentId ??= `legacy-${track.rideId}`;
          track.source ??= 'foreground';
        });
      });
  }
}

export const rideDb = new RideDb();

const pendingRideReads = createSingleFlight();
const isSessionListRead = (key: string) =>
  key === 'sessions:first' || key === 'sessions:all' || key.startsWith('sessions:page:');
const invalidateRideReads = (rideId?: string) => {
  const prefixes = ['session:', 'location:', 'tracks:', 'photos:'];
  pendingRideReads.invalidate((key) =>
    isSessionListRead(key) || prefixes.some((prefix) =>
      key.startsWith(prefix) && (rideId === undefined || key === `${prefix}${rideId}`),
    ),
  );
};

export const saveRideSession = async (session: RideSession) => {
  await rideDb.sessions.put(session);
  invalidateRideReads(session.rideId);
};

export const updateRideSession = async (
  rideId: string,
  updates: Partial<Omit<RideSession, 'rideId'>>,
) => {
  const updatedCount = await rideDb.sessions.update(rideId, updates);
  invalidateRideReads(rideId);
  return updatedCount;
};

/** Persist progress without replacing lifecycle fields from a stale session snapshot. */
export const saveRideProgress = async (
  fallbackSession: RideSession,
  durationSeconds: number,
  distanceMeters: number,
) => {
  const { rideId } = fallbackSession;
  await rideDb.transaction('rw', rideDb.sessions, async () => {
    const existing = await rideDb.sessions.get(rideId);
    const progress = {
      durationSeconds: Math.max(existing?.durationSeconds ?? 0, durationSeconds),
      distanceMeters: Math.max(existing?.distanceMeters ?? 0, distanceMeters),
    };

    if (existing) {
      await rideDb.sessions.update(rideId, progress);
      return;
    }

    await rideDb.sessions.put({ ...fallbackSession, ...progress });
  });
  invalidateRideReads(rideId);
};

export const getRideSession = async () =>
  pendingRideReads.run('sessions:first', () => rideDb.sessions.toCollection().first());

export const getAllSessions = async (): Promise<RideSession[]> =>
  pendingRideReads.run('sessions:all', () =>
    rideDb.sessions.orderBy('createdAt').reverse().toArray(),
  );

export const getSession = async (rideId: string) =>
  pendingRideReads.run(`session:${rideId}`, () => rideDb.sessions.get(rideId));

export const getSessionsPage = async (page: number, pageSize: number) => {
  return pendingRideReads.run(`sessions:page:${page}:${pageSize}`, () => {
    const offset = Math.max(0, (page - 1) * pageSize);
    return rideDb.sessions
      .orderBy('createdAt')
      .reverse()
      .offset(offset)
      .limit(pageSize)
      .toArray();
  });
};

export const deleteSession = async (rideId: string) => {
  await rideDb.transaction(
    'rw',
    [rideDb.sessions, rideDb.locations, rideDb.tracks, rideDb.photos, rideDb.outbox],
    async () => {
      await rideDb.sessions.delete(rideId);
      await rideDb.locations.delete(rideId);
      await rideDb.tracks.where('rideId').equals(rideId).delete();
      await rideDb.photos.where('rideId').equals(rideId).delete();
      await rideDb.outbox.where('rideId').equals(rideId).delete();
    },
  );
  invalidateRideReads(rideId);
};

export const deleteTrackPoints = async (rideId: string) => {
  await rideDb.tracks.where('rideId').equals(rideId).delete();
  pendingRideReads.invalidate((key) => key === `tracks:${rideId}`);
};

export const clearRideSession = async () => {
  await rideDb.sessions.clear();
  invalidateRideReads();
};

export const saveLastLocation = async (
  rideId: string,
  location: LocationPoint,
) => {
  await rideDb.locations.put({ rideId, ...location });
  pendingRideReads.invalidate((key) => key === `location:${rideId}`);
};

export const getLastLocation = async (rideId: string) =>
  pendingRideReads.run(`location:${rideId}`, () => rideDb.locations.get(rideId));

type PersistLocationOptions = {
  rideId: string;
  riderId: string;
  point: AcceptedLocationPoint;
  enqueueForSync: boolean;
};

export const persistAcceptedLocation = async ({
  rideId,
  riderId,
  point,
  enqueueForSync,
}: PersistLocationOptions) => {
  await rideDb.transaction(
    'rw',
    [rideDb.sessions, rideDb.locations, rideDb.tracks, rideDb.outbox],
    async () => {
      const existingPoint = await rideDb.tracks
        .where('pointId')
        .equals(point.pointId)
        .first();
      await rideDb.locations.put({ rideId, ...point });
      if (!existingPoint) {
        await rideDb.tracks.add({ rideId, ...point });
      }
      const session = await rideDb.sessions.get(rideId);
      if (session) {
        await rideDb.sessions.update(rideId, {
          activeSegmentId: point.segmentId,
        });
      }
      if (enqueueForSync) {
        await rideDb.outbox.put({
          rideId,
          riderId,
          ...point,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: Date.now(),
          createdAt: new Date().toISOString(),
        });
      }
    },
  );
  invalidateRideReads(rideId);
};

export const appendTrackPoint = async (
  rideId: string,
  location: LocationPoint,
) => {
  const pointId = `event-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const segmentId = `legacy-${rideId}`;
  await rideDb.tracks.add({
    rideId,
    ...location,
    pointId,
    segmentId,
    source: 'foreground',
  });
  pendingRideReads.invalidate((key) => key === `tracks:${rideId}`);
};

export const appendTrackEvent = async (
  rideId: string,
  point: AcceptedLocationPoint,
  event: string,
) => {
  const pointId = `event-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  await rideDb.tracks.add({ rideId, ...point, pointId, event });
  pendingRideReads.invalidate((key) => key === `tracks:${rideId}`);
};

export const getTrackPoints = async (rideId: string) =>
  pendingRideReads.run(`tracks:${rideId}`, () =>
    rideDb.tracks.where('rideId').equals(rideId).sortBy('timestamp'),
  );

export const addPhoto = async (photo: PhotoRecord) => {
  const id = await rideDb.photos.add(photo);
  pendingRideReads.invalidate((key) => key === `photos:${photo.rideId}`);
  return id;
};

export const getPhotos = async (rideId: string) =>
  pendingRideReads.run(`photos:${rideId}`, () =>
    rideDb.photos.where('rideId').equals(rideId).sortBy('timestamp'),
  );

export const deletePhotos = async (rideId: string) => {
  await rideDb.photos.where('rideId').equals(rideId).delete();
  pendingRideReads.invalidate((key) => key === `photos:${rideId}`);
};

export const getDueOutboxBatch = async (nowMs: number, limit = 50) => {
  const due = await rideDb.outbox
    .where('nextAttemptAt')
    .belowOrEqual(nowMs)
    .filter((record) => record.status === 'pending')
    .toArray();
  return due
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(0, limit);
};

export const getPendingOutboxCount = async () =>
  rideDb.outbox.filter((record) => record.status !== 'failed').count();

export const acknowledgeOutboxPoints = async (pointIds: string[]) => {
  await rideDb.outbox.bulkDelete(pointIds);
};

export const failOutboxPoints = async (
  failures: Array<{ pointId: string; reason: string }>,
) => {
  await rideDb.transaction('rw', rideDb.outbox, async () => {
    await Promise.all(
      failures.map(({ pointId, reason }) =>
        rideDb.outbox.update(pointId, {
          status: 'failed',
          failureReason: reason,
        }),
      ),
    );
  });
};

export const pauseOutboxPointsForAuthentication = async (
  records: LocationOutboxRecord[],
  reason: string,
) => {
  await rideDb.transaction('rw', rideDb.outbox, async () => {
    await Promise.all(
      records.map((record) =>
        rideDb.outbox.update(record.pointId, {
          status: 'authentication-required',
          failureReason: reason,
        }),
      ),
    );
  });
};

export const rescheduleOutboxPoints = async (
  records: LocationOutboxRecord[],
  nextAttemptAt: number,
) => {
  await rideDb.transaction('rw', rideDb.outbox, async () => {
    await Promise.all(
      records.map((record) =>
        rideDb.outbox.update(record.pointId, {
          attempts: record.attempts + 1,
          nextAttemptAt,
        }),
      ),
    );
  });
};
