import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { createLocationProviders } from '../services/LocationProviderFactory';
import { prepareLocationPermissions } from '../services/locationPermissions';
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

export const useLocationTracker = (
  autoStart = false,
  onAcceptedLocation?: (point: AcceptedLocationPoint) => void,
): TrackerState => {
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
  const startingProviderRef = useRef<ILocationProvider | null>(null);
  const providerUnsubscribeRef = useRef<(() => void) | null>(null);
  const isStartingRef = useRef(false);
  const isTrackingRef = useRef(false);
  const shouldResumeRef = useRef(false);
  const startAttemptRef = useRef(0);
  const backgroundIssueRef = useRef<string | null>(null);
  const operationRef = useRef(0);
  const freshnessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptedLocationRef = useRef(onAcceptedLocation);
  acceptedLocationRef.current = onAcceptedLocation;
  const appIsActiveRef = useRef(true);

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

      // The durable sink must see every accepted callback, including batched
      // background updates that never become separate React renders.
      acceptedLocationRef.current?.(decision.point);
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
      startingProviderRef.current?.stop();
      startingProviderRef.current = null;
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
        const currentSource = Capacitor.getPlatform() === 'android'
          && provider === providersRef.current.background
          ? (appIsActiveRef.current ? 'foreground' : 'background')
          : source;
        acceptRawPoint(point, currentSource);
      });
      try {
        startingProviderRef.current = provider;
        await provider.start();
        if (operation !== operationRef.current) {
          unsubscribe();
          return;
        }
        startingProviderRef.current = null;
        providerUnsubscribeRef.current = unsubscribe;
        activeProviderRef.current = provider;
        const currentPermission = await provider.getPermissionState();
        if (operation !== operationRef.current) return;
        setPermission(currentPermission);
        if (source === 'background') {
          backgroundIssueRef.current = null;
          setError(null);
        } else if (!backgroundIssueRef.current) {
          setError(null);
        }
        isTrackingRef.current = true;
        setIsTracking(true);
      } catch (startError) {
        unsubscribe();
        if (operation === operationRef.current) {
          provider.stop();
          startingProviderRef.current = null;
          operationRef.current += 1;
          activeProviderRef.current = null;
          isTrackingRef.current = false;
          setIsTracking(false);
          clearLocationFreshness();
          const message = startError instanceof Error
            ? startError.message
            : 'Failed to start location tracking.';
          if (source === 'background') backgroundIssueRef.current = message;
          setError(message);
        }
        throw startError;
      }
    },
    [acceptRawPoint, clearLocationFreshness],
  );

  const startTracking = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    const startAttempt = ++startAttemptRef.current;
    try {
      const state = await App.getState();
      appIsActiveRef.current = state.isActive;
      if (startAttempt !== startAttemptRef.current) return;
      const { foreground, background } = providersRef.current;

      if (
        state.isActive
        && Capacitor.getPlatform() === 'android'
        && background.prepareForBackgroundTracking
      ) {
        let backgroundIssue: string | null = null;
        try {
          // Permissions/Settings are handled with no watcher running. Arm the
          // foreground service while active, before the phone can be locked.
          await prepareLocationPermissions();
        } catch (prepareError) {
          backgroundIssue = prepareError instanceof Error
            ? prepareError.message
            : 'Background tracking is unavailable. Allow RoadTrip background location and notification access, then retry.';
        }

        // stopTracking invalidates this attempt while a native permission flow
        // is open. Do not let its eventual result restart GPS after stop/unmount.
        if (startAttempt !== startAttemptRef.current) return;
        const activeState = await App.getState();
        if (startAttempt !== startAttemptRef.current) return;
        appIsActiveRef.current = activeState.isActive;
        if (!activeState.isActive) {
          throw new Error('Open RoadTrip to finish location setup and start tracking.');
        }
        backgroundIssueRef.current = backgroundIssue;
        if (backgroundIssue) {
          const foregroundPermission = await foreground.getPermissionState();
          if (startAttempt !== startAttemptRef.current) return;
          if (foregroundPermission !== 'granted') throw new Error(backgroundIssue);
          await switchProvider(foreground, 'foreground');
        } else {
          try {
            await switchProvider(background, 'foreground');
          } catch (backgroundError) {
            if (startAttempt !== startAttemptRef.current) return;
            backgroundIssue = backgroundError instanceof Error ? backgroundError.message : 'Background tracking is unavailable.';
            backgroundIssueRef.current = backgroundIssue;
            await switchProvider(foreground, 'foreground');
          }
        }
        if (startAttempt !== startAttemptRef.current) return;
        setError(backgroundIssue);
        return;
      }

      if (
        state.isActive
        && activeProviderRef.current === foreground
        && providerUnsubscribeRef.current
      ) {
        return;
      }

      await switchProvider(
        state.isActive ? foreground : background,
        state.isActive ? 'foreground' : 'background',
      );
    } catch (startError) {
      if (startAttempt === startAttemptRef.current) {
        setError(startError instanceof Error ? startError.message : 'Failed to start location tracking.');
      }
      throw startError;
    } finally {
      if (startAttempt === startAttemptRef.current) {
        isStartingRef.current = false;
      }
    }
  }, [switchProvider]);

  const stopTracking = useCallback(() => {
    startAttemptRef.current += 1;
    isStartingRef.current = false;
    operationRef.current += 1;
    shouldResumeRef.current = false;
    providerUnsubscribeRef.current?.();
    providerUnsubscribeRef.current = null;
    if (startingProviderRef.current && startingProviderRef.current !== activeProviderRef.current) {
      startingProviderRef.current.stop();
    }
    startingProviderRef.current = null;
    activeProviderRef.current?.stop();
    activeProviderRef.current = null;
    isTrackingRef.current = false;
    backgroundIssueRef.current = null;
    setIsTracking(false);
    setError(null);
    clearLocationFreshness();
  }, [clearLocationFreshness]);

  const startNewSegment = useCallback((segmentId = createSegmentId()) => {
    segmentIdRef.current = segmentId;
    filterRef.current.reset();
    return segmentId;
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    void startTracking().catch(() => undefined);
    return stopTracking;
  }, [autoStart, startTracking, stopTracking]);

  useEffect(() => () => stopTracking(), [stopTracking]);

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
      appIsActiveRef.current = state.isActive;
      if (Capacitor.getPlatform() === 'android' && activeProviderRef.current === background) {
        // This watcher is already a foreground service and supports both states.
        return;
      }
      if (!state.isActive && isTrackingRef.current) {
        shouldResumeRef.current = true;
        if (Capacitor.getPlatform() === 'android') {
          providerUnsubscribeRef.current?.();
          providerUnsubscribeRef.current = null;
          foreground.stop();
          activeProviderRef.current = null;
          isTrackingRef.current = false;
          setIsTracking(false);
          clearLocationFreshness();
          return;
        }
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
  }, [clearLocationFreshness, switchProvider]);

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
