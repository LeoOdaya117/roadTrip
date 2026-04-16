import { useEffect, useRef, useState } from 'react';
import { sendLocation } from '../services/api';
import { getLastLocation, saveLastLocation } from '../services/offlineDb';
import { LocationPoint } from '../types/ride';

type SyncParams = {
  rideId?: string;
  riderId?: string;
  isTracking: boolean;
  isOnline: boolean;
  location: LocationPoint | null;
};

// 4s interval balances timely updates with battery/network usage.
const SYNC_INTERVAL_MS = 4000;

export const useRideLocationSync = ({
  rideId,
  riderId,
  isTracking,
  isOnline,
  location
}: SyncParams) => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const latestLocationRef = useRef<LocationPoint | null>(location);
  const isSendingRef = useRef(false);

  useEffect(() => {
    latestLocationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!rideId || !riderId || !location) {
      return;
    }

    saveLastLocation(rideId, location).catch(() => undefined);
  }, [location, rideId, riderId]);

  useEffect(() => {
    if (!rideId || !riderId || !isTracking) {
      return;
    }

    const syncLocation = async () => {
      const latest = latestLocationRef.current;
      if (!latest || isSendingRef.current) {
        return;
      }

      if (!isOnline) {
        setSyncStatus('Waiting for connection to sync...');
        return;
      }

      try {
        isSendingRef.current = true;
        await sendLocation(rideId, riderId, latest.lat, latest.lng, latest.speed);
        setSyncStatus(null);
      } catch (error) {
        setSyncStatus(
          error instanceof Error ? error.message : 'Location sync failed.'
        );
      } finally {
        isSendingRef.current = false;
      }
    };

    const interval = window.setInterval(syncLocation, SYNC_INTERVAL_MS);
    syncLocation();

    return () => window.clearInterval(interval);
  }, [isOnline, isTracking, rideId, riderId]);

  useEffect(() => {
    if (!isOnline || !rideId || !riderId) {
      return;
    }

    getLastLocation(rideId)
      .then((stored) => {
        if (!stored) {
          return;
        }
        return sendLocation(rideId, riderId, stored.lat, stored.lng, stored.speed);
      })
      .catch(() => undefined);
  }, [isOnline, rideId, riderId]);

  return { syncStatus };
};
