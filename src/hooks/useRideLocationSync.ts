import { useEffect, useRef, useState } from 'react';
import { sendLocation } from '../services/api';
import { appendTrackPoint, getLastLocation, saveLastLocation } from '../services/offlineDb';
import { LocationPoint } from '../types/ride';

type SyncParams = {
  rideId?: string;
  riderId?: string;
  isTracking: boolean;
  isOnline: boolean;
  isSoloMode?: boolean;
  location: LocationPoint | null;
};

// 4s interval balances timely updates with battery/network usage.
const SYNC_INTERVAL_MS = 4000;

export const useRideLocationSync = ({
  rideId,
  riderId,
  isTracking,
  isOnline,
  isSoloMode = false,
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

    // Always save the last known position locally
    console.debug('[useRideLocationSync] saving location to DB', { 
      rideId, 
      lat: location.lat, 
      lng: location.lng,
      timestamp: location.timestamp,
      isSoloMode 
    });
    saveLastLocation(rideId, location).catch((err) => {
      console.error('[useRideLocationSync] failed to save last location', err);
    });

    // In solo mode, also append every point to the full track log
    if (isSoloMode) {
      appendTrackPoint(rideId, location).catch((err) => {
        console.error('[useRideLocationSync] failed to append track point', err);
      }).then(() => {
        console.debug('[useRideLocationSync] track point appended successfully');
      });
    }
  }, [location, rideId, riderId, isSoloMode]);

  useEffect(() => {
    // Treat ride IDs prefixed with "solo-" as solo sessions as a fallback
    const inferredSolo = (rideId ?? '').startsWith('solo-');
    // Solo mode: no API calls needed
    if (isSoloMode || inferredSolo || !rideId || !riderId || !isTracking) {
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
        console.debug('[useRideLocationSync] sending location', { rideId, riderId, lat: latest.lat, lng: latest.lng });
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

    return () => window.clearInterval(interval);
  }, [isOnline, isSoloMode, isTracking, rideId, riderId]);

  useEffect(() => {
    // Treat ride IDs prefixed with "solo-" as solo sessions as a fallback
    const inferredSolo = (rideId ?? '').startsWith('solo-');
    // Solo mode: skip reconnect flush to API
    if (isSoloMode || inferredSolo || !isOnline || !rideId || !riderId) {
      return;
    }

    getLastLocation(rideId)
      .then((stored) => {
        if (!stored) {
          return;
        }
        console.debug('[useRideLocationSync] flushing stored location to API', { rideId, riderId, stored });
        return sendLocation(rideId, riderId, stored.lat, stored.lng, stored.speed);
      })
      .catch(() => undefined);
  }, [isOnline, isSoloMode, rideId, riderId]);

  return { syncStatus };
};
