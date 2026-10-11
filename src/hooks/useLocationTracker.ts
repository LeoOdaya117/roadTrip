import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { createLocationProviders } from '../services/LocationProviderFactory';
import type ILocationProvider from '../services/ILocationProvider';
import {
  LOCATION_FILTER_LIMITS,
  LocationQualityFilter,
  type LocationRejectionReason,
} from '../services/locationFilter';
import type {
  AcceptedLocationPoint,
  LocationPoint,
  LocationSource,
} from '../types/ride';
import type { PermissionState } from '../services/ILocationProvider';

export type LocationQualityState = {
  acceptedCount: number;
  rejectedCount: number;
  lastRejectedReason: LocationRejectionReason | null;
};

type TrackerState = {
  location: AcceptedLocationPoint | null;
  hasFreshLocation: boolean;
  isTracking: boolean;
  permission: PermissionState;
  error: string | null;
  quality: LocationQualityState;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  startNewSegment: (segmentId?: string) => string;
};

const createSegmentId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `segment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const initialQuality: LocationQualityState = {
  acceptedCount: 0,
  rejectedCount: 0,
  lastRejectedReason: null,
};

export const useLocationTracker = (autoStart = false): TrackerState => {
  const [location, setLocation] = useState<AcceptedLocationPoint | null>(null);
  const [hasFreshLocation, setHasFreshLocation] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<LocationQualityState>(initialQuality);

  const providersRef = useRef(createLocationProviders());
  const filterRef = useRef(new LocationQualityFilter());
  const segmentIdRef = useRef(createSegmentId());
  const activeProviderRef = useRef<ILocationProvider | null>(null);
  const providerUnsubscribeRef = useRef<(() => void) | null>(null);
  const isStartingRef = useRef(false);
  const isTrackingRef = useRef(false);
  const shouldResumeRef = useRef(false);
  const operationRef = useRef(0);
  const freshnessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLocationFreshness = useCallback(() => {
    if (freshnessTimerRef.current !== null) {
      clearTimeout(freshnessTimerRef.current);
      freshnessTimerRef.current = null;
    }
    setHasFreshLocation(false);
  }, []);

  const refreshLocationFreshness = useCallback(() => {
    if (freshnessTimerRef.current !== null) {
      clearTimeout(freshnessTimerRef.current);
    }
    setHasFreshLocation(true);
    freshnessTimerRef.current = setTimeout(() => {
      freshnessTimerRef.current = null;
      setHasFreshLocation(false);
    }, LOCATION_FILTER_LIMITS.maxPointAgeMs);
  }, []);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  const acceptRawPoint = useCallback(
    (rawPoint: LocationPoint, source: LocationSource) => {
      const now = Date.now();
      const decision = filterRef.current.evaluate(
        rawPoint,
        source,
        segmentIdRef.current,
      );
      if (!decision.accepted) {
        setQuality((current) => ({
          ...current,
          rejectedCount: current.rejectedCount + 1,
          lastRejectedReason: decision.reason,
        }));
        console.debug('[useLocationTracker] rejected location', decision.reason);
        const rawTimestampMs = Date.parse(rawPoint.timestamp);
        const hasCurrentTimestamp = Number.isFinite(rawTimestampMs)
          && rawTimestampMs <= now
          && rawTimestampMs >= now - LOCATION_FILTER_LIMITS.maxPointAgeMs;
        if (
          hasCurrentTimestamp
          && (decision.reason === 'too-soon' || decision.reason === 'too-close')
        ) {
          refreshLocationFreshness();
        }
        return;
      }

      setLocation(decision.point);
      const rawTimestampMs = Date.parse(rawPoint.timestamp);
      if (
        Number.isFinite(rawTimestampMs)
        && rawTimestampMs <= now
        && rawTimestampMs >= now - LOCATION_FILTER_LIMITS.maxPointAgeMs
      ) {
        refreshLocationFreshness();
      }
      setQuality((current) => ({
        acceptedCount: current.acceptedCount + 1,
        rejectedCount: current.rejectedCount,
        lastRejectedReason: null,
      }));
    },
    [refreshLocationFreshness],
  );

  const switchProvider = useCallback(
    async (provider: ILocationProvider, source: LocationSource) => {
      if (
        activeProviderRef.current === provider &&
        providerUnsubscribeRef.current
      ) {
        return;
      }

      const operation = ++operationRef.current;
      providerUnsubscribeRef.current?.();
      providerUnsubscribeRef.current = null;
      if (activeProviderRef.current && activeProviderRef.current !== provider) {
        activeProviderRef.current.stop();
      }

      const unsubscribe = provider.onLocation((point) => {
        if (
          operation !== operationRef.current
          || (!isTrackingRef.current && !isStartingRef.current)
        ) return;
        acceptRawPoint(point, source);
      });
      try {
        await provider.start();
        if (operation !== operationRef.current) {
          unsubscribe();
          provider.stop();
          return;
        }
        providerUnsubscribeRef.current = unsubscribe;
        activeProviderRef.current = provider;
        setPermission(await provider.getPermissionState());
        setError(null);
        isTrackingRef.current = true;
        setIsTracking(true);
      } catch (startError) {
        unsubscribe();
        if (operation === operationRef.current) {
          operationRef.current += 1;
          activeProviderRef.current = null;
          isTrackingRef.current = false;
          setIsTracking(false);
          clearLocationFreshness();
          setError(
            startError instanceof Error
              ? startError.message
              : 'Failed to start location tracking.',
          );
        }
        throw startError;
      }
    },
    [acceptRawPoint, clearLocationFreshness],
  );

  const startTracking = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    try {
      const state = await App.getState();
      const { foreground, background } = providersRef.current;
      await switchProvider(
        state.isActive ? foreground : background,
        state.isActive ? 'foreground' : 'background',
      );
    } finally {
      isStartingRef.current = false;
    }
  }, [switchProvider]);

  const stopTracking = useCallback(() => {
    operationRef.current += 1;
    providerUnsubscribeRef.current?.();
    providerUnsubscribeRef.current = null;
    activeProviderRef.current?.stop();
    activeProviderRef.current = null;
    isTrackingRef.current = false;
    setIsTracking(false);
    clearLocationFreshness();
  }, [clearLocationFreshness]);

  const startNewSegment = useCallback((segmentId = createSegmentId()) => {
    segmentIdRef.current = segmentId;
    filterRef.current.reset();
    return segmentId;
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    void startTracking();
    return stopTracking;
  }, [autoStart, startTracking, stopTracking]);

  useEffect(() => () => {
    if (freshnessTimerRef.current !== null) {
      clearTimeout(freshnessTimerRef.current);
      freshnessTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let listener: PluginListenerHandle | null = null;
    let cancelled = false;
    const { foreground, background } = providersRef.current;

    void App.addListener('appStateChange', async (state) => {
      if (!state.isActive && isTrackingRef.current) {
        shouldResumeRef.current = true;
        try {
          await switchProvider(background, 'background');
        } catch {
          // switchProvider exposes the recoverable error state
        }
      } else if (state.isActive && shouldResumeRef.current) {
        shouldResumeRef.current = false;
        try {
          await switchProvider(foreground, 'foreground');
        } catch {
          // switchProvider exposes the recoverable error state
        }
      }
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else listener = handle;
    });

    return () => {
      cancelled = true;
      void listener?.remove();
    };
  }, [switchProvider]);

  return {
    location,
    hasFreshLocation,
    isTracking,
    permission,
    error,
    quality,
    startTracking,
    stopTracking,
    startNewSegment,
  };
};
