import Dexie, { Table } from 'dexie';
import { LocationPoint, RideSession } from '../types/ride';

type LocationRecord = LocationPoint & { rideId: string };

class RideDb extends Dexie {
  sessions!: Table<RideSession, string>;
  locations!: Table<LocationRecord, string>;

  constructor() {
    super('rideTrackerDb');
    this.version(1).stores({
      sessions: 'rideId',
      locations: 'rideId'
    });
  }
}

export const rideDb = new RideDb();

export const saveRideSession = async (session: RideSession) => {
  await rideDb.sessions.put(session);
};

export const getRideSession = async () => rideDb.sessions.toCollection().first();

export const clearRideSession = async () => rideDb.sessions.clear();

export const saveLastLocation = async (rideId: string, location: LocationPoint) => {
  await rideDb.locations.put({ rideId, ...location });
};

export const getLastLocation = async (rideId: string) => rideDb.locations.get(rideId);
