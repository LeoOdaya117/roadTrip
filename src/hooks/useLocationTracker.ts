import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocationPoint } from '../types/ride';

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
  const lastUpdateRef = useRef<LocationPoint | null>(null);
  const shouldResumeRef = useRef(false);

  const updateLocation = useCallback((nextLocation: LocationPoint) => {
    const previous = lastUpdateRef.current;
    if (previous) {
      const timeDiff =
        new Date(nextLocation.timestamp).getTime() -
        new Date(previous.timestamp).getTime();
      const distance = distanceMeters(previous, nextLocation);

      if (timeDiff < MIN_UPDATE_INTERVAL_MS && distance < MIN_DISTANCE_METERS) {
        return;
      }
    }

    lastUpdateRef.current = nextLocation;
    setLocation(nextLocation);
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current) {
      Geolocation.clearWatch({ id: watchIdRef.current });
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const permissionStatus = await Geolocation.checkPermissions();
      const nextPermission =
        permissionStatus.location ?? permissionStatus.coarseLocation ?? 'prompt';

      if (nextPermission !== 'granted') {
        const requestStatus = await Geolocation.requestPermissions({
          permissions: ['location', 'coarseLocation']
        });
        const requestPermission =
          requestStatus.location ??
          requestStatus.coarseLocation ??
          'prompt';
        setPermission(requestPermission);

        if (requestPermission !== 'granted') {
          setError('Location permission denied.');
          return;
        }
      } else {
        setPermission('granted');
      }

      setError(null);
      setIsTracking(true);

      if (watchIdRef.current) {
        Geolocation.clearWatch({ id: watchIdRef.current });
      }

      try {
        const current = await Geolocation.getCurrentPosition(GEOLOCATION_OPTIONS);

        updateLocation({
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          speed: current.coords.speed ?? null,
          timestamp: new Date(current.timestamp).toISOString()
        });
      } catch (currentError) {
        setError(
          currentError instanceof Error
            ? currentError.message
            : 'Unable to fetch location.'
        );
      }

      watchIdRef.current = await Geolocation.watchPosition(
        GEOLOCATION_OPTIONS,
        (position, watchError) => {
          if (watchError) {
            setError(watchError.message);
            return;
          }

          if (!position) {
            setError('Location unavailable.');
            return;
          }

          updateLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            speed: position.coords.speed ?? null,
            timestamp: new Date(position.timestamp).toISOString()
          });
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tracking.');
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
    let listener: PluginListenerHandle | null = null;
    let isCancelled = false;

    App.addListener('appStateChange', (state) => {
      if (!state.isActive && isTracking) {
        shouldResumeRef.current = true;
        stopTracking();
      }

      if (state.isActive && shouldResumeRef.current) {
        shouldResumeRef.current = false;
        startTracking();
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
  }, [isTracking, startTracking, stopTracking]);

  return {
    location,
    isTracking,
    permission,
    error,
    startTracking,
    stopTracking
  };
};
