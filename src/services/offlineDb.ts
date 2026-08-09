import Dexie, { type Table } from 'dexie';
import type {
  AcceptedLocationPoint,
  LocationPoint,
  LocationSource,
  PhotoRecord,
  RideSession,
} from '../types/ride';

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

export const saveRideSession = async (session: RideSession) => {
  await rideDb.sessions.put(session);
};

export const getRideSession = async () => rideDb.sessions.toCollection().first();

export const getAllSessions = async (): Promise<RideSession[]> =>
  rideDb.sessions.orderBy('createdAt').reverse().toArray();

export const getSession = async (rideId: string) => rideDb.sessions.get(rideId);

export const getSessionsPage = async (page: number, pageSize: number) => {
  const offset = Math.max(0, (page - 1) * pageSize);
  return rideDb.sessions
    .orderBy('createdAt')
    .reverse()
    .offset(offset)
    .limit(pageSize)
    .toArray();
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
};

export const deleteTrackPoints = async (rideId: string) => {
  await rideDb.tracks.where('rideId').equals(rideId).delete();
};

export const clearRideSession = async () => rideDb.sessions.clear();

export const saveLastLocation = async (
  rideId: string,
  location: LocationPoint,
) => {
  await rideDb.locations.put({ rideId, ...location });
};

export const getLastLocation = async (rideId: string) =>
  rideDb.locations.get(rideId);

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
};

export const appendTrackEvent = async (
  rideId: string,
  point: AcceptedLocationPoint,
  event: string,
) => {
  const pointId = `event-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  await rideDb.tracks.add({ rideId, ...point, pointId, event });
};

export const getTrackPoints = async (rideId: string) =>
  rideDb.tracks.where('rideId').equals(rideId).sortBy('timestamp');

export const addPhoto = async (photo: PhotoRecord) => rideDb.photos.add(photo);

export const getPhotos = async (rideId: string) =>
  rideDb.photos.where('rideId').equals(rideId).sortBy('timestamp');

export const deletePhotos = async (rideId: string) =>
  rideDb.photos.where('rideId').equals(rideId).delete();

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
