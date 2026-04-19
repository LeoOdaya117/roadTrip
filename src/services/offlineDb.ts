import Dexie, { Table } from 'dexie';
import { LocationPoint, RideSession } from '../types/ride';

type LocationRecord = LocationPoint & { rideId: string };

export type TrackPoint = LocationPoint & { rideId: string; id?: number };

class RideDb extends Dexie {
  sessions!: Table<RideSession, string>;
  locations!: Table<LocationRecord, string>;
  tracks!: Table<TrackPoint, number>;

  constructor() {
    super('rideTrackerDb');
    this.version(1).stores({
      sessions: 'rideId',
      locations: 'rideId'
    });
    this.version(2).stores({
      sessions: 'rideId',
      locations: 'rideId',
      tracks: '++id, rideId'
    });
    this.version(3).stores({
      sessions: 'rideId, createdAt',
      locations: 'rideId',
      tracks: '++id, rideId'
    });
    this.version(4).stores({
      sessions: 'rideId, createdAt',
      locations: 'rideId',
      tracks: '++id, rideId',
      photos: '++id, rideId, timestamp'
    });
  }
}

export const rideDb = new RideDb();

export const saveRideSession = async (session: RideSession) => {
  await rideDb.sessions.put(session);
};

export const getRideSession = async () => rideDb.sessions.toCollection().first();

export const getAllSessions = async (): Promise<RideSession[]> => {
  return rideDb.sessions.orderBy('createdAt').reverse().toArray();
};

export const getSession = async (rideId: string): Promise<RideSession | undefined> => {
  return rideDb.sessions.get(rideId);
};

export const getSessionsPage = async (page: number, pageSize: number): Promise<RideSession[]> => {
  const offset = Math.max(0, (page - 1) * pageSize);
  // Dexie collection supports offset() and limit()
  return rideDb.sessions.orderBy('createdAt').reverse().offset(offset).limit(pageSize).toArray();
};

export const deleteSession = async (rideId: string) => {
  await rideDb.sessions.delete(rideId);
};

export const deleteTrackPoints = async (rideId: string) => {
  await rideDb.tracks.where('rideId').equals(rideId).delete();
};

export const clearRideSession = async () => rideDb.sessions.clear();

export const saveLastLocation = async (rideId: string, location: LocationPoint) => {
  await rideDb.locations.put({ rideId, ...location });
};

export const getLastLocation = async (rideId: string) => rideDb.locations.get(rideId);

/** Append a GPS point to the solo ride track log */
export const appendTrackPoint = async (rideId: string, location: LocationPoint) => {
  await rideDb.tracks.add({ rideId, ...location });
};

/** Get all recorded track points for a ride, oldest first */
export const getTrackPoints = async (rideId: string): Promise<TrackPoint[]> => {
  return rideDb.tracks.where('rideId').equals(rideId).sortBy('timestamp');
};

export type PhotoRecord = {
  id?: number;
  rideId: string;
  // full image blob
  data?: Blob;
  // thumbnail blob
  thumb?: Blob;
  lat?: number;
  lng?: number;
  timestamp: string;
  note?: string;
};

export const addPhoto = async (photo: PhotoRecord) => {
  // returns the generated id
  return rideDb.table('photos').add(photo as any);
};

export const getPhotos = async (rideId: string): Promise<PhotoRecord[]> => {
  return rideDb.table('photos').where('rideId').equals(rideId).sortBy('timestamp');
};

export const deletePhotos = async (rideId: string) => {
  return rideDb.table('photos').where('rideId').equals(rideId).delete();
};
