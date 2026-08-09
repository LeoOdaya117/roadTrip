import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  LocationBatchRequestError,
  sendLocation,
  sendLocationBatch,
} from '../services/api';
import {
  acknowledgeOutboxPoints,
  failOutboxPoints,
  getDueOutboxBatch,
  getLastLocation,
  getPendingOutboxCount,
  pauseOutboxPointsForAuthentication,
  persistAcceptedLocation,
  rescheduleOutboxPoints,
} from '../services/offlineDb';
import {
  classifyLocationOutboxFailure,
  isLocationBatchSyncEnabled,
  locationOutboxRetryDelayMs,
} from '../services/locationOutboxPolicy';
import type { AcceptedLocationPoint } from '../types/ride';

type SyncParams = {
  rideId?: string;
  riderId?: string;
  isTracking: boolean;
  isOnline: boolean;
  isSoloMode?: boolean;
  location: AcceptedLocationPoint | null;
};

const LIVE_SYNC_INTERVAL_MS = 4000;
const OUTBOX_FLUSH_INTERVAL_MS = 15_000;
const OUTBOX_BATCH_SIZE = 50;
const batchSyncEnabled = isLocationBatchSyncEnabled(
  import.meta.env.VITE_ENABLE_LOCATION_BATCH_SYNC,
);

export const useRideLocationSync = ({
  rideId,
  riderId,
  isTracking,
  isOnline,
  isSoloMode = false,
  location,
}: SyncParams) => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const latestLocationRef = useRef<AcceptedLocationPoint | null>(location);
  const liveSendInFlightRef = useRef(false);
  const outboxFlushInFlightRef = useRef(false);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    latestLocationRef.current = location;
  }, [location]);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const refreshPendingCount = useCallback(async () => {
    if (!batchSyncEnabled) return;
    const count = await getPendingOutboxCount();
    if (mountedRef.current) setPendingOutboxCount(count);
  }, []);

  const flushOutbox = useCallback(async () => {
    if (!batchSyncEnabled || !isOnline || outboxFlushInFlightRef.current) return;
    outboxFlushInFlightRef.current = true;
    try {
      const due = await getDueOutboxBatch(Date.now(), OUTBOX_BATCH_SIZE);
      if (due.length === 0) {
        await refreshPendingCount();
        return;
      }

      const first = due[0];
      const batch = due.filter(
        (record) =>
          record.rideId === first.rideId && record.riderId === first.riderId,
      );
      try {
        const response = await sendLocationBatch(
          first.rideId,
          first.riderId,
          batch,
        );
        await acknowledgeOutboxPoints(response.acceptedPointIds);
        await failOutboxPoints(response.rejected);
        const handled = new Set([
          ...response.acceptedPointIds,
          ...response.rejected.map((item) => item.pointId),
        ]);
        const unhandled = batch.filter((record) => !handled.has(record.pointId));
        if (unhandled.length > 0) {
          const attempt = Math.max(...unhandled.map((record) => record.attempts));
          await rescheduleOutboxPoints(
            unhandled,
            Date.now() + locationOutboxRetryDelayMs(attempt),
          );
        }
        if (mountedRef.current) setSyncStatus(null);
      } catch (error) {
        const status =
          error instanceof LocationBatchRequestError ? error.status : undefined;
        const action = classifyLocationOutboxFailure(status);
        if (action === 'permanent-failure') {
          await failOutboxPoints(
            batch.map((record) => ({
              pointId: record.pointId,
              reason: error instanceof Error ? error.message : 'Invalid location',
            })),
          );
        } else if (action === 'authentication-required') {
          await pauseOutboxPointsForAuthentication(
            batch,
            error instanceof Error ? error.message : 'Authentication required',
          );
          if (mountedRef.current) {
            setSyncStatus('Track upload paused: authentication required.');
          }
        } else {
          const attempt = Math.max(...batch.map((record) => record.attempts));
          await rescheduleOutboxPoints(
            batch,
            Date.now() + locationOutboxRetryDelayMs(attempt),
          );
          if (mountedRef.current) {
            setSyncStatus('Track upload queued for retry.');
          }
        }
      }
      await refreshPendingCount();
    } finally {
      outboxFlushInFlightRef.current = false;
    }
  }, [isOnline, refreshPendingCount]);

  useEffect(() => {
    if (!rideId || !riderId || !location) return;
    const inferredSolo = rideId.startsWith('solo-');
    persistenceQueueRef.current = persistenceQueueRef.current
      .then(() =>
        persistAcceptedLocation({
          rideId,
          riderId,
          point: location,
          enqueueForSync:
            batchSyncEnabled && !isSoloMode && !inferredSolo,
        }),
      )
      .then(async () => {
        if (mountedRef.current) setPersistenceError(null);
        await refreshPendingCount();
        await flushOutbox();
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setPersistenceError(
            error instanceof Error
              ? error.message
              : 'Failed to persist the current track point.',
          );
        }
      });
  }, [
    flushOutbox,
    isSoloMode,
    location,
    refreshPendingCount,
    rideId,
    riderId,
  ]);

  useEffect(() => {
    const inferredSolo = (rideId ?? '').startsWith('solo-');
    if (isSoloMode || inferredSolo || !rideId || !riderId || !isTracking) return;

    const syncLatestLocation = async () => {
      const latest = latestLocationRef.current;
      if (!latest || liveSendInFlightRef.current) return;
      if (!isOnline) {
        setSyncStatus('Waiting for connection to sync live location.');
        return;
      }
      try {
        liveSendInFlightRef.current = true;
        await sendLocation(
          rideId,
          riderId,
          latest.lat,
          latest.lng,
          latest.speed,
        );
        setSyncStatus(null);
      } catch (error) {
        setSyncStatus(
          error instanceof Error ? error.message : 'Live location sync failed.',
        );
      } finally {
        liveSendInFlightRef.current = false;
      }
    };

    const interval = window.setInterval(
      () => void syncLatestLocation(),
      LIVE_SYNC_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [isOnline, isSoloMode, isTracking, rideId, riderId]);

  useEffect(() => {
    const inferredSolo = (rideId ?? '').startsWith('solo-');
    if (isSoloMode || inferredSolo || !isOnline || !rideId || !riderId) return;
    void getLastLocation(rideId).then((stored) => {
      if (!stored) return;
      return sendLocation(rideId, riderId, stored.lat, stored.lng, stored.speed);
    }).catch(() => undefined);
  }, [isOnline, isSoloMode, rideId, riderId]);

  useEffect(() => {
    if (!batchSyncEnabled || !isOnline) return;
    void flushOutbox();
    const interval = window.setInterval(
      () => void flushOutbox(),
      OUTBOX_FLUSH_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [flushOutbox, isOnline]);

  useEffect(() => {
    if (!batchSyncEnabled) return;
    let listener: PluginListenerHandle | null = null;
    let cancelled = false;
    void App.addListener('appStateChange', (state) => {
      if (state.isActive) void flushOutbox();
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else listener = handle;
    });
    return () => {
      cancelled = true;
      void listener?.remove();
    };
  }, [flushOutbox]);

  return {
    syncStatus,
    persistenceError,
    pendingOutboxCount,
    flushOutbox,
  };
};
