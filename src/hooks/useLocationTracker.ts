import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { LocationPoint } from '../types/ride';
import { createLocationProviders } from '../services/LocationProviderFactory';
import type ILocationProvider from '../services/ILocationProvider';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

type TrackerState = {
  location: LocationPoint | null;
  isTracking: boolean;
  permission: PermissionState;
  error: string | null;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
};

// Filter GPS jitter while keeping near real-time updates.
const MIN_UPDATE_INTERVAL_MS = 3000;
const MIN_DISTANCE_METERS = 6;
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 2000
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceMeters = (a: LocationPoint, b: LocationPoint) => {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

export const useLocationTracker = (autoStart = false): TrackerState => {
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<string | null>(null);
  const isStartingRef = useRef(false);
  const lastUpdateRef = useRef<LocationPoint | null>(null);
  const shouldResumeRef = useRef(false);
  const isTrackingRef = useRef(false);
  const { foreground, background } = createLocationProviders();
  const activeProviderRef = useRef<ILocationProvider | null>(null);
  const providerUnsubRef = useRef<(() => void) | null>(null);

  const updateLocation = useCallback((nextLocation: LocationPoint, source: 'foreground' | 'background' = 'foreground') => {
    const previous = lastUpdateRef.current;
    // If update came from background provider, always accept and log it
    if (source === 'background') {
      lastUpdateRef.current = nextLocation;
      setLocation(nextLocation);
      console.debug('[useLocationTracker] background location update', {
        lat: nextLocation.lat,
        lng: nextLocation.lng,
        speed: nextLocation.speed,
        accuracy: nextLocation.accuracy,
        timestamp: nextLocation.timestamp
      });
      return;
    }

    if (previous) {
      const timeDiff =
        new Date(nextLocation.timestamp).getTime() -
        new Date(previous.timestamp).getTime();
      const distance = distanceMeters(previous, nextLocation);

      if (timeDiff < MIN_UPDATE_INTERVAL_MS && distance < MIN_DISTANCE_METERS) {
        console.debug('[useLocationTracker] skipped jitter', { timeDiff, distance, nextLocation });
        return;
      }
    }

    lastUpdateRef.current = nextLocation;
    setLocation(nextLocation);
    console.debug('[useLocationTracker] location update', {
      lat: nextLocation.lat,
      lng: nextLocation.lng,
      speed: nextLocation.speed,
      accuracy: nextLocation.accuracy,
      timestamp: nextLocation.timestamp
    });
  }, []);

  const stopTracking = useCallback(() => {
    providerUnsubRef.current?.();
    providerUnsubRef.current = null;
    if (activeProviderRef.current) {
      try {
        activeProviderRef.current.stop();
      } catch (_) {}
      activeProviderRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  const startTracking = useCallback(async () => {
    if (isStartingRef.current) {
      console.debug('[useLocationTracker] startTracking already running, skipping');
      return;
    }
    isStartingRef.current = true;

      const switchToProvider = async (provider: ILocationProvider) => {
      providerUnsubRef.current?.();
      providerUnsubRef.current = null;
      if (activeProviderRef.current && activeProviderRef.current !== provider) {
        try {
          activeProviderRef.current.stop();
        } catch (_) {}
      }

      try {
        await provider.start();
        // Pass source hint so background updates bypass jitter filter
        const isBackground = provider === background;
        providerUnsubRef.current = provider.onLocation((pt) => updateLocation(pt, isBackground ? 'background' : 'foreground'));
        activeProviderRef.current = provider;
        setIsTracking(true);
        const perm = await provider.getPermissionState();
        setPermission(perm);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start tracking.');
        setIsTracking(false);
      }
    };

    try {
      const state = await App.getState();
      const provider = state.isActive ? foreground : background;
      await switchToProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tracking.');
      setIsTracking(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [updateLocation]);

  useEffect(() => {
    if (!autoStart) {
      return;
    }

    startTracking();
    return () => stopTracking();
  }, [autoStart, startTracking, stopTracking]);

  useEffect(() => {
    // Register app state change listener once. Switch providers when app state changes.
    let listener: PluginListenerHandle | null = null;
    let isCancelled = false;

    App.addListener('appStateChange', async (state) => {
      console.debug('[useLocationTracker] appStateChange', { state, activeProvider: activeProviderRef.current?.constructor?.name });
      if (!state.isActive && isTrackingRef.current) {
        shouldResumeRef.current = true;
        // switch to background provider
        try {
          // If already using background provider and subscribed, skip restart
          if (activeProviderRef.current === background && providerUnsubRef.current) {
            console.debug('[useLocationTracker] background provider already active, skipping restart');
          } else {
            providerUnsubRef.current?.();
            providerUnsubRef.current = null;
            if (activeProviderRef.current) {
              try { activeProviderRef.current.stop(); } catch (_) {}
            }
            await background.start();
            console.debug('[useLocationTracker] started background provider');
            providerUnsubRef.current = background.onLocation((pt) => updateLocation(pt, 'background'));
            activeProviderRef.current = background;
            setIsTracking(true);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to switch to background tracking.');
          setIsTracking(false);
        }
      }

      if (state.isActive && shouldResumeRef.current) {
        shouldResumeRef.current = false;
        // switch back to foreground provider
        try {
          // If already using foreground provider and subscribed, skip restart
          if (activeProviderRef.current === foreground && providerUnsubRef.current) {
            console.debug('[useLocationTracker] foreground provider already active, skipping restart');
          } else {
            providerUnsubRef.current?.();
            providerUnsubRef.current = null;
            if (activeProviderRef.current) {
              try { activeProviderRef.current.stop(); } catch (_) {}
            }
            await foreground.start();
            console.debug('[useLocationTracker] started foreground provider');
            providerUnsubRef.current = foreground.onLocation((pt) => updateLocation(pt, 'foreground'));
            activeProviderRef.current = foreground;
            setIsTracking(true);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to switch to foreground tracking.');
          setIsTracking(false);
        }
      }
    }).then((handle) => {
      if (isCancelled) {
        handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      isCancelled = true;
      listener?.remove();
    };
  // only run once (providers and factory are stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    location,
    isTracking,
    permission,
    error,
    startTracking,
    stopTracking
  };
};
