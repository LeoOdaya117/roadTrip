import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateOfflineRoute,
  downloadNavigationTiles,
  getNavigationAvailability,
  speakNavigationPrompt,
  stopNavigationSpeech,
  supportsTurnByTurnNavigation,
} from '../services/navigationEngine';
import {
  distanceAlongRouteMeters,
  nearestRouteProgress,
  nextRouteManeuver,
  updateOffRouteFixCount,
} from '../services/navigationRoute';
import { getSession, saveRideSession } from '../services/offlineDb';
import type {
  AcceptedLocationPoint,
  NavigationDestination,
  NavigationRoute,
} from '../types/ride';

export type RideNavigationState = {
  destination: NavigationDestination | null;
  route: NavigationRoute | null;
  nextInstruction: string | null;
  distanceToNextManeuverMeters: number | null;
  isRouting: boolean;
  isGuiding: boolean;
  isDownloadingTiles: boolean;
  tileDownloadProgress: number | null;
  error: string | null;
  supported: boolean;
  offlineAvailable: boolean;
  setDestination: (destination: NavigationDestination) => Promise<void>;
  startGuidance: () => Promise<void>;
  stopGuidance: () => void;
  clearDestination: () => Promise<void>;
  downloadTiles: () => Promise<void>;
};

export const useRideNavigation = (
  rideId: string | undefined,
  location: AcceptedLocationPoint | null | undefined,
  isTracking: boolean,
): RideNavigationState => {
  const [destination, setDestinationState] = useState<NavigationDestination | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [isGuiding, setIsGuiding] = useState(false);
  const [isDownloadingTiles, setIsDownloadingTiles] = useState(false);
  const [tileDownloadProgress, setTileDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(supportsTurnByTurnNavigation());
  const [offlineAvailable, setOfflineAvailable] = useState(false);
  const routeOperationRef = useRef(0);
  const routeInFlightRef = useRef(false);
  const inFlightDestinationKeyRef = useRef<string | null>(null);
  const pendingRouteRef = useRef<{
    origin: AcceptedLocationPoint;
    destination: NavigationDestination;
    rerouting: boolean;
  } | null>(null);
  const offRouteFixCountRef = useRef(0);
  const lastPointIdRef = useRef<string | null>(null);
  const spokenManeuverRef = useRef<number | null>(null);
  const didRestoreRef = useRef(false);
  const didAutoRouteRef = useRef(false);
  const previousTrackingRef = useRef(isTracking);

  const routeFrom = useCallback(async (
    origin: AcceptedLocationPoint,
    target: NavigationDestination,
    rerouting = false,
  ) => {
    if (routeInFlightRef.current) {
      const destinationKey = `${target.lat},${target.lng}`;
      if (inFlightDestinationKeyRef.current !== destinationKey) {
        pendingRouteRef.current = { origin, destination: target, rerouting };
      }
      return;
    }
    routeInFlightRef.current = true;
    inFlightDestinationKeyRef.current = `${target.lat},${target.lng}`;
    const operation = ++routeOperationRef.current;
    setIsRouting(true);
    setError(null);
    try {
      const nextRoute = await calculateOfflineRoute(origin, target);
      if (operation !== routeOperationRef.current) return;
      setRoute(nextRoute);
      offRouteFixCountRef.current = 0;
      spokenManeuverRef.current = null;
      if (rerouting && isGuiding && isTracking) {
        const firstInstruction = nextRoute.maneuvers[0]?.instruction;
        if (firstInstruction) await speakNavigationPrompt(`Route updated. ${firstInstruction}`);
      }
    } catch (routeError) {
      if (operation === routeOperationRef.current) {
        setRoute(null);
        setError(routeError instanceof Error
          ? routeError.message
          : 'Unable to calculate a route. Check your connection or install the regional offline map.');
      }
    } finally {
      if (operation === routeOperationRef.current) setIsRouting(false);
      routeInFlightRef.current = false;
      inFlightDestinationKeyRef.current = null;
      const pending = pendingRouteRef.current;
      pendingRouteRef.current = null;
      if (pending) void routeFrom(pending.origin, pending.destination, pending.rerouting);
    }
  }, [isGuiding, isTracking]);

  useEffect(() => {
    let cancelled = false;
    didRestoreRef.current = false;
    didAutoRouteRef.current = false;
    pendingRouteRef.current = null;
    setDestinationState(null);
    setRoute(null);
    setIsGuiding(false);
    setError(null);
    routeOperationRef.current += 1;
    routeInFlightRef.current = false;
    inFlightDestinationKeyRef.current = null;
    offRouteFixCountRef.current = 0;
    lastPointIdRef.current = null;
    if (!rideId) return;

    void getSession(rideId).then((session) => {
      if (cancelled) return;
      didRestoreRef.current = true;
      const restoredDestination = session?.endedAt ? null : session?.navigationDestination ?? null;
      setDestinationState(restoredDestination);
      setIsGuiding(Boolean(
        restoredDestination
        && session?.navigationEnabled !== false
        && !session?.endedAt,
      ));
    }).catch(() => {
      if (!cancelled) didRestoreRef.current = true;
    });

    return () => {
      cancelled = true;
      routeOperationRef.current += 1;
      routeInFlightRef.current = false;
      void stopNavigationSpeech().catch(() => undefined);
    };
  }, [rideId]);

  useEffect(() => {
    if (!supportsTurnByTurnNavigation()) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    void getNavigationAvailability().then((availability) => {
      if (cancelled) return;
      setSupported(availability.available);
      setOfflineAvailable(availability.offlineAvailable);
      if (!availability.available && availability.message) setError(availability.message);
    }).catch((availabilityError: unknown) => {
      if (cancelled && !supportsTurnByTurnNavigation()) return;
      setSupported(false);
      setError(availabilityError instanceof Error
        ? availabilityError.message
        : 'Offline navigation is unavailable on this device.');
    });
    return () => { cancelled = true; };
  }, []);

  const persistDestination = useCallback(async (
    value: NavigationDestination | null,
    enabled = false,
  ) => {
    if (!rideId) return;
    const session = await getSession(rideId);
    if (!session) return;
    if (value) {
      await saveRideSession({ ...session, navigationDestination: value, navigationEnabled: enabled });
    } else {
      const withoutDestination = { ...session };
      delete withoutDestination.navigationDestination;
      delete withoutDestination.navigationEnabled;
      await saveRideSession(withoutDestination);
    }
  }, [rideId]);

  const setDestination = useCallback(async (value: NavigationDestination) => {
    routeOperationRef.current += 1;
    pendingRouteRef.current = null;
    setDestinationState(value);
    setRoute(null);
    setError(null);
    offRouteFixCountRef.current = 0;
    spokenManeuverRef.current = null;
    try {
      await persistDestination(value, false);
      if (location && supported) {
        didAutoRouteRef.current = true;
        await routeFrom(location, value);
      } else {
        didAutoRouteRef.current = false;
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the destination.');
    }
  }, [location, persistDestination, routeFrom, supported]);

  const startGuidance = useCallback(async () => {
    if (!supportsTurnByTurnNavigation()) {
      setError('Turn-by-turn navigation is available in the Android app.');
      return;
    }
    const availability = await getNavigationAvailability();
    setSupported(availability.available);
    if (!availability.available) {
      setError(availability.message ?? 'Offline navigation tiles are not available.');
      return;
    }
    setError(null);
    setIsGuiding(true);
    if (destination) {
      try {
        await persistDestination(destination, true);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Could not save navigation state.');
      }
    }
    if (destination && location && !route) await routeFrom(location, destination);
  }, [destination, location, persistDestination, route, routeFrom]);

  const downloadTiles = useCallback(async () => {
    if (isDownloadingTiles) return;
    setIsDownloadingTiles(true);
    setTileDownloadProgress(0);
    setError(null);
    try {
      await downloadNavigationTiles(setTileDownloadProgress);
      const availability = await getNavigationAvailability();
      setSupported(availability.available);
      setOfflineAvailable(availability.offlineAvailable);
      if (!availability.available) {
        throw new Error(availability.message ?? 'Downloaded offline map data could not be opened.');
      }
      setTileDownloadProgress(100);
    } catch (downloadError) {
      setError(downloadError instanceof Error
        ? downloadError.message
        : 'Offline map data could not be downloaded. Check your connection and retry.');
    } finally {
      setIsDownloadingTiles(false);
      setTileDownloadProgress(null);
    }
  }, [isDownloadingTiles]);

  const stopGuidance = useCallback(() => {
    setIsGuiding(false);
    offRouteFixCountRef.current = 0;
    void persistDestination(destination, false).catch((saveError: unknown) => {
      setError(saveError instanceof Error ? saveError.message : 'Could not save navigation state.');
    });
    void stopNavigationSpeech().catch(() => undefined);
  }, [destination, persistDestination]);

  const clearDestination = useCallback(async () => {
    setDestinationState(null);
    setRoute(null);
    setIsGuiding(false);
    setError(null);
    offRouteFixCountRef.current = 0;
    routeOperationRef.current += 1;
    pendingRouteRef.current = null;
    routeInFlightRef.current = false;
    inFlightDestinationKeyRef.current = null;
    setIsRouting(false);
    await persistDestination(null);
    void stopNavigationSpeech().catch(() => undefined);
  }, [persistDestination]);

  useEffect(() => {
    if (!didRestoreRef.current || didAutoRouteRef.current || !destination || !location) return;
    if (supported) {
      didAutoRouteRef.current = true;
      void routeFrom(location, destination);
    }
  }, [destination, location, route, routeFrom, supported]);

  useEffect(() => {
    if (!isTracking) {
      void stopNavigationSpeech().catch(() => undefined);
      previousTrackingRef.current = false;
      return;
    }
    if (!previousTrackingRef.current && isGuiding && destination && location && route) {
      void routeFrom(location, destination, true);
    }
    previousTrackingRef.current = true;
  }, [destination, isGuiding, isTracking, location, route, routeFrom]);

  const progress = useMemo(() => {
    if (!location || !route) return null;
    return nearestRouteProgress(location, route);
  }, [location, route]);

  const maneuver = progress && route
    ? nextRouteManeuver(progress.shapeIndex, route)
    : null;
  const distanceToNextManeuverMeters = maneuver && progress && route
    ? distanceAlongRouteMeters(progress.shapeIndex, maneuver.shapeIndex, route)
    : null;

  useEffect(() => {
    if (!location || !route || !destination || !isGuiding || !isTracking || !progress) {
      offRouteFixCountRef.current = 0;
      return;
    }
    if (lastPointIdRef.current === location.pointId) return;
    lastPointIdRef.current = location.pointId;
    const decision = updateOffRouteFixCount(
      offRouteFixCountRef.current,
      progress.distanceMeters,
      location.accuracy,
    );
    offRouteFixCountRef.current = decision.count;
    if (decision.shouldReroute && !routeInFlightRef.current) {
      void routeFrom(location, destination, true);
    }
  }, [destination, isGuiding, isTracking, location, progress, route, routeFrom]);

  useEffect(() => {
    if (!location || !route || !maneuver || !isGuiding || !isTracking) return;
    if (distanceToNextManeuverMeters == null || distanceToNextManeuverMeters > 500) return;
    if (spokenManeuverRef.current === maneuver.id) return;
    spokenManeuverRef.current = maneuver.id;
    void speakNavigationPrompt(`${Math.max(0, Math.round(distanceToNextManeuverMeters / 50) * 50)} meters. ${maneuver.instruction}`)
      .catch((speechError: unknown) => {
        setError(speechError instanceof Error ? speechError.message : 'Voice guidance is unavailable.');
      });
  }, [distanceToNextManeuverMeters, isGuiding, isTracking, location, maneuver, route]);

  return {
    destination,
    route,
    nextInstruction: maneuver?.instruction ?? null,
    distanceToNextManeuverMeters,
    isRouting,
    isGuiding,
    isDownloadingTiles,
    tileDownloadProgress,
    error,
    supported,
    offlineAvailable,
    setDestination,
    startGuidance,
    stopGuidance,
    clearDestination,
    downloadTiles,
  };
};
